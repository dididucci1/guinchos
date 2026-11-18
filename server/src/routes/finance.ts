import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";
import { HttpError, idParam } from "../auth.js";
import { optMoney } from "../validation.js";

/**
 * Financeiro da frota: quanto cada viagem rendeu e custou, por guincho e por mês.
 * - Faturamento: valor cobrado das viagens concluídas (pela data de saída).
 * - Despesas de viagem: lançadas pelos motoristas (exceto recusadas), pela data do gasto.
 * - Manutenção: custo das concluídas (data de conclusão). Documentos/seguros: valor pela data de emissão.
 */
export const financeRouter = Router();

const ISO = /^\d{4}-\d{2}-\d{2}$/;

financeRouter.get("/", async (req, res) => {
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  if (!ISO.test(from) || !ISO.test(to)) throw new HttpError(400, "Período inválido");
  if (from > to) throw new HttpError(400, "A data inicial é depois da final");
  const p = [from, to];

  const USAGE_IN = "u.status = 'concluida' AND u.started_at >= $1::date AND u.started_at < $2::date + 1";
  const EXP_IN = "e.status <> 'recusada' AND e.spent_at >= $1::date AND e.spent_at < $2::date + 1";
  const MAINT_IN = "m.status = 'concluida' AND m.completed_at >= $1::date AND m.completed_at < $2::date + 1";
  const DOC_IN = "d.amount IS NOT NULL AND d.issue_date BETWEEN $1::date AND $2::date";

  const [[totals], byCategory, byTruck, trips, monthly, reimburse] = await Promise.all([
    query(
      `SELECT
         (SELECT COALESCE(SUM(u.amount),0) FROM usages u WHERE ${USAGE_IN}) AS revenue,
         (SELECT COUNT(*)::int FROM usages u WHERE ${USAGE_IN}) AS trips,
         (SELECT COUNT(*)::int FROM usages u WHERE ${USAGE_IN} AND u.amount IS NULL) AS trips_without_amount,
         (SELECT COALESCE(SUM(u.end_km - u.start_km),0)::int FROM usages u WHERE ${USAGE_IN}) AS km,
         (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE ${EXP_IN}) AS expenses,
         (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE ${EXP_IN} AND e.status = 'pendente') AS expenses_pending,
         (SELECT COUNT(*)::int FROM expenses e WHERE ${EXP_IN} AND e.status = 'pendente') AS expenses_pending_count,
         (SELECT COALESCE(SUM(m.cost),0) FROM maintenances m WHERE ${MAINT_IN}) AS maintenance,
         (SELECT COALESCE(SUM(d.amount),0) FROM documents d WHERE ${DOC_IN}) AS documents`,
      p,
    ),
    query(
      `SELECT e.category, COALESCE(SUM(e.amount),0) AS amount, COUNT(*)::int AS count
       FROM expenses e WHERE ${EXP_IN} GROUP BY e.category ORDER BY amount DESC`,
      p,
    ),
    query(
      `SELECT t.id, t.plate, t.model,
         COALESCE(u.trips,0)::int AS trips, COALESCE(u.km,0)::int AS km, COALESCE(u.revenue,0) AS revenue,
         COALESCE(e.amount,0) AS expenses, COALESCE(m.cost,0) AS maintenance, COALESCE(d.amount,0) AS documents
       FROM trucks t
       LEFT JOIN (SELECT u.truck_id, COUNT(*) AS trips, SUM(u.end_km - u.start_km) AS km, SUM(u.amount) AS revenue
                  FROM usages u WHERE ${USAGE_IN} GROUP BY u.truck_id) u ON u.truck_id = t.id
       LEFT JOIN (SELECT e.truck_id, SUM(e.amount) AS amount FROM expenses e WHERE ${EXP_IN} GROUP BY e.truck_id) e ON e.truck_id = t.id
       LEFT JOIN (SELECT m.truck_id, SUM(m.cost) AS cost FROM maintenances m WHERE ${MAINT_IN} GROUP BY m.truck_id) m ON m.truck_id = t.id
       LEFT JOIN (SELECT d.truck_id, SUM(d.amount) AS amount FROM documents d WHERE ${DOC_IN} GROUP BY d.truck_id) d ON d.truck_id = t.id
       WHERE t.status <> 'inativo' OR u.trips IS NOT NULL OR e.amount IS NOT NULL OR m.cost IS NOT NULL
       ORDER BY COALESCE(u.revenue,0) - COALESCE(e.amount,0) - COALESCE(m.cost,0) - COALESCE(d.amount,0) DESC, t.plate`,
      p,
    ),
    query(
      `SELECT u.id, u.truck_id, t.plate, t.model, u.service, u.client, u.origin, u.destination, u.started_at, u.ended_at,
         (u.end_km - u.start_km) AS distance_km, u.amount, dr.name AS driver_name,
         COALESCE(x.expenses,0) AS expenses, COALESCE(x.count,0)::int AS expense_count, COALESCE(x.pending,0)::int AS pending_count
       FROM usages u
       JOIN trucks t ON t.id = u.truck_id
       LEFT JOIN users dr ON dr.id = u.driver_id
       LEFT JOIN (SELECT usage_id, SUM(amount) AS expenses, COUNT(*) AS count, COUNT(*) FILTER (WHERE status = 'pendente') AS pending
                  FROM expenses WHERE status <> 'recusada' AND usage_id IS NOT NULL GROUP BY usage_id) x ON x.usage_id = u.id
       WHERE ${USAGE_IN}
       ORDER BY u.started_at DESC LIMIT 300`,
      p,
    ),
    // Seis meses terminando no mês da data final.
    query(
      `SELECT to_char(mo, 'YYYY-MM') AS month,
         (SELECT COALESCE(SUM(u.amount),0) FROM usages u WHERE u.status = 'concluida' AND date_trunc('month', u.started_at) = mo) AS revenue,
         (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.status <> 'recusada' AND date_trunc('month', e.spent_at) = mo) AS expenses,
         (SELECT COALESCE(SUM(m.cost),0) FROM maintenances m WHERE m.status = 'concluida' AND date_trunc('month', m.completed_at) = mo) AS maintenance,
         (SELECT COALESCE(SUM(d.amount),0) FROM documents d WHERE d.amount IS NOT NULL AND date_trunc('month', d.issue_date) = mo) AS documents
       FROM generate_series(date_trunc('month', $1::date) - interval '5 months', date_trunc('month', $1::date), interval '1 month') mo
       ORDER BY mo`,
      [to],
    ),
    // A reembolsar (independe do período): aprovadas, pagas pelo motorista e ainda não devolvidas.
    query(
      `SELECT e.driver_id, d.name AS driver_name, COALESCE(SUM(e.amount),0) AS amount, COUNT(*)::int AS count
       FROM expenses e LEFT JOIN users d ON d.id = e.driver_id
       WHERE e.status = 'aprovada' AND e.paid_by = 'motorista' AND e.reimbursed_at IS NULL
       GROUP BY e.driver_id, d.name ORDER BY amount DESC`,
    ),
  ]);

  res.json({ totals, byCategory, byTruck, trips, monthly, reimburse });
});

/** Define o valor cobrado de uma viagem (conferência do financeiro). */
financeRouter.patch("/trips/:id", async (req, res) => {
  const id = idParam(req);
  const b = z.object({ amount: optMoney }).parse(req.body);
  const [row] = await query("UPDATE usages SET amount = $1 WHERE id = $2 RETURNING id, amount", [b.amount, id]);
  if (!row) throw new HttpError(404, "Viagem não encontrada");
  res.json(row);
});
