import { Router } from "express";
import { query } from "../db.js";
import { CURRENT_DOCS_SQL, DOC_WARN_DAYS, PREVENTIVE_DUE_SQL } from "../fleet.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (_req, res) => {
  const [byStatus, [month], docs, preventive, cnh, active, scheduled, topTrucks] = await Promise.all([
    query<{ status: string; count: number }>("SELECT status, COUNT(*)::int AS count FROM trucks GROUP BY status"),
    query(
      `SELECT
         (SELECT COUNT(*)::int FROM usages WHERE status = 'concluida' AND started_at >= date_trunc('month', now())) AS services,
         (SELECT COALESCE(SUM(end_km - start_km),0)::int FROM usages WHERE status = 'concluida' AND started_at >= date_trunc('month', now())) AS km,
         (SELECT COALESCE(SUM(cost),0) FROM maintenances WHERE status = 'concluida' AND completed_at >= date_trunc('month', now())) AS maintenance_cost,
         (SELECT COUNT(*)::int FROM maintenances WHERE status = 'concluida' AND completed_at >= date_trunc('month', now())) AS maintenances`,
    ),
    query(`SELECT * FROM (${CURRENT_DOCS_SQL}) x WHERE situation IN ('vencido','a_vencer') ORDER BY expiry_date`),
    query(`SELECT * FROM (${PREVENTIVE_DUE_SQL}) x WHERE situation <> 'ok' AND scheduled_id IS NULL ORDER BY situation DESC, next_due_date NULLS LAST`),
    query(
      `SELECT id, name, cnh_expiry, (cnh_expiry - CURRENT_DATE) AS days_left FROM users
       WHERE role = 'motorista' AND active AND cnh_expiry IS NOT NULL AND cnh_expiry <= CURRENT_DATE + ${DOC_WARN_DAYS}
       ORDER BY cnh_expiry`,
    ),
    query(
      `SELECT u.id, u.service, u.client, u.destination, u.started_at, u.start_km, t.id AS truck_id, t.plate, t.model, d.name AS driver_name
       FROM usages u JOIN trucks t ON t.id = u.truck_id LEFT JOIN users d ON d.id = u.driver_id
       WHERE u.status = 'em_andamento' ORDER BY u.started_at`,
    ),
    query(
      `SELECT m.id, m.type, m.description, m.scheduled_date, t.id AS truck_id, t.plate, t.model
       FROM maintenances m JOIN trucks t ON t.id = m.truck_id
       WHERE m.status = 'agendada' ORDER BY m.scheduled_date NULLS LAST LIMIT 8`,
    ),
    // Km e serviços de cada guincho em operação no mês (inclui quem rodou zero).
    query(
      `SELECT t.id, t.plate, t.model, COUNT(u.id)::int AS services, COALESCE(SUM(u.end_km - u.start_km),0)::int AS km
       FROM trucks t LEFT JOIN usages u ON u.truck_id = t.id AND u.status = 'concluida' AND u.started_at >= date_trunc('month', now())
       WHERE t.status <> 'inativo'
       GROUP BY t.id ORDER BY km DESC, t.plate`,
    ),
  ]);

  const [[prev], daily, maintMonthly, serviceTypes] = await Promise.all([
    // Mês anterior até o mesmo dia, para comparar de forma justa.
    query(
      `SELECT
         (SELECT COUNT(*)::int FROM usages WHERE status = 'concluida'
            AND started_at >= date_trunc('month', now()) - interval '1 month' AND started_at < now() - interval '1 month') AS services,
         (SELECT COALESCE(SUM(end_km - start_km),0)::int FROM usages WHERE status = 'concluida'
            AND started_at >= date_trunc('month', now()) - interval '1 month' AND started_at < now() - interval '1 month') AS km,
         (SELECT COALESCE(SUM(cost),0) FROM maintenances WHERE status = 'concluida'
            AND completed_at >= date_trunc('month', now()) - interval '1 month' AND completed_at < now() - interval '1 month') AS maintenance_cost`,
    ),
    // Últimos 30 dias completos (sem hoje, que ainda está em andamento); dias sem serviço viram zero.
    query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day,
              COALESCE(SUM(u.end_km - u.start_km),0)::int AS km, COUNT(u.id)::int AS services
       FROM generate_series(CURRENT_DATE - 30, CURRENT_DATE - 1, interval '1 day') d
       LEFT JOIN usages u ON u.status = 'concluida' AND u.started_at::date = d::date
       GROUP BY d ORDER BY d`,
    ),
    // Custo de manutenção dos últimos 6 meses, separado por tipo.
    query(
      `SELECT to_char(m, 'YYYY-MM') AS month,
              COALESCE(SUM(x.cost) FILTER (WHERE x.type = 'preventiva'),0) AS preventiva,
              COALESCE(SUM(x.cost) FILTER (WHERE x.type = 'corretiva'),0) AS corretiva,
              COUNT(x.id)::int AS count
       FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
       LEFT JOIN maintenances x ON x.status = 'concluida' AND date_trunc('month', x.completed_at) = m
       GROUP BY m ORDER BY m`,
    ),
    query(
      `SELECT service, COUNT(*)::int AS count FROM usages
       WHERE status = 'concluida' AND started_at >= now() - interval '30 days'
       GROUP BY service ORDER BY count DESC LIMIT 6`,
    ),
  ]);

  const [exp] = await query(
    `SELECT COUNT(*)::int AS pending_count, COALESCE(SUM(amount),0) AS pending_amount,
       (SELECT COALESCE(SUM(amount),0) FROM usages WHERE status = 'concluida' AND started_at >= date_trunc('month', now())) AS month_revenue,
       (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE status <> 'recusada' AND spent_at >= date_trunc('month', now())) AS month_expenses
     FROM expenses WHERE status = 'pendente'`,
  );

  const counts = { disponivel: 0, em_servico: 0, manutencao: 0, inativo: 0 } as Record<string, number>;
  for (const r of byStatus) counts[r.status] = r.count;

  res.json({ counts, expenses: exp, month, prev, docs, preventive, cnh, active, scheduled, topTrucks, daily, maintMonthly, serviceTypes });
});
