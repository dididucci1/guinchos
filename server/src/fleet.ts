import type { Queryable } from "./db.js";
import { HttpError } from "./auth.js";

export type TruckStatus = "disponivel" | "em_servico" | "manutencao" | "inativo";

/** Busca o guincho travando a linha durante a transação (evita duas saídas simultâneas). */
export async function lockTruck(db: Queryable, truckId: number) {
  const [truck] = await db.query<{ id: number; status: TruckStatus; odometer_km: number; plate: string }>(
    "SELECT id, status, odometer_km, plate FROM trucks WHERE id = $1 FOR UPDATE",
    [truckId],
  );
  if (!truck) throw new HttpError(404, "Guincho não encontrado");
  return truck;
}

/** Muda a disponibilidade do guincho e registra no histórico. */
export async function setTruckStatus(
  db: Queryable,
  truckId: number,
  from: TruckStatus,
  to: TruckStatus,
  userId: number | null,
  note?: string | null,
) {
  if (from === to) return;
  await db.query("UPDATE trucks SET status = $1, status_since = now() WHERE id = $2", [to, truckId]);
  await db.query("INSERT INTO truck_events (truck_id, user_id, from_status, to_status, note) VALUES ($1,$2,$3,$4,$5)", [
    truckId,
    userId,
    from,
    to,
    note ?? null,
  ]);
}

/** Atualiza a quilometragem apenas para frente. */
export async function bumpOdometer(db: Queryable, truckId: number, km: number | null | undefined) {
  if (km == null) return;
  await db.query("UPDATE trucks SET odometer_km = GREATEST(odometer_km, $1) WHERE id = $2", [km, truckId]);
}

/** Depois de encerrar uma manutenção/utilização, decide para qual status o guincho volta. */
export async function releaseTruck(db: Queryable, truckId: number, userId: number, note: string) {
  const truck = await lockTruck(db, truckId);
  const [{ open_maint, active_use }] = await db.query<{ open_maint: number; active_use: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM maintenances WHERE truck_id = $1 AND status = 'em_andamento') AS open_maint,
       (SELECT COUNT(*)::int FROM usages WHERE truck_id = $1 AND status = 'em_andamento') AS active_use`,
    [truckId],
  );
  if (truck.status === "inativo") return;
  const to: TruckStatus = open_maint > 0 ? "manutencao" : active_use > 0 ? "em_servico" : "disponivel";
  await setTruckStatus(db, truckId, truck.status, to, userId, note);
}

/** Dias de antecedência para avisar vencimentos. */
export const DOC_WARN_DAYS = 30;
export const MAINT_WARN_DAYS = 15;
export const MAINT_WARN_KM = 1000;

/** Documentos vigentes (o mais recente de cada tipo por guincho) com situação calculada. */
export const CURRENT_DOCS_SQL = `
  SELECT d.*, t.plate, t.model,
    CASE
      WHEN d.expiry_date IS NULL THEN 'sem_validade'
      WHEN d.expiry_date < CURRENT_DATE THEN 'vencido'
      WHEN d.expiry_date <= CURRENT_DATE + ${DOC_WARN_DAYS} THEN 'a_vencer'
      ELSE 'em_dia'
    END AS situation,
    (d.expiry_date - CURRENT_DATE) AS days_left
  FROM documents d
  JOIN trucks t ON t.id = d.truck_id
  WHERE NOT EXISTS (
    SELECT 1 FROM documents n
    WHERE n.truck_id = d.truck_id AND n.type = d.type AND n.type <> 'outro'
      AND (COALESCE(n.expiry_date, '9999-12-31') > COALESCE(d.expiry_date, '9999-12-31')
           OR (COALESCE(n.expiry_date, '9999-12-31') = COALESCE(d.expiry_date, '9999-12-31') AND n.id > d.id))
  )`;

/**
 * Próxima preventiva de cada guincho, a partir da última preventiva concluída que tenha próxima data/km.
 * `scheduled_id` aponta a preventiva já agendada/em andamento depois dela (aviso resolvido).
 */
export const PREVENTIVE_DUE_SQL = `
  SELECT p.*,
    (p.next_due_date - CURRENT_DATE) AS days_left,
    (p.next_due_km - p.odometer_km) AS km_left,
    CASE
      WHEN (p.next_due_date IS NOT NULL AND p.next_due_date < CURRENT_DATE)
        OR (p.next_due_km IS NOT NULL AND p.odometer_km >= p.next_due_km) THEN 'vencida'
      WHEN (p.next_due_date IS NOT NULL AND p.next_due_date <= CURRENT_DATE + ${MAINT_WARN_DAYS})
        OR (p.next_due_km IS NOT NULL AND p.next_due_km - p.odometer_km <= ${MAINT_WARN_KM}) THEN 'proxima'
      ELSE 'ok'
    END AS situation,
    (SELECT o.id FROM maintenances o
       WHERE o.truck_id = p.truck_id AND o.type = 'preventiva' AND o.status IN ('agendada','em_andamento')
         AND o.created_at > p.completed_at
       ORDER BY o.created_at LIMIT 1) AS scheduled_id
  FROM (
    SELECT DISTINCT ON (m.truck_id)
      m.truck_id, t.plate, t.model, t.odometer_km, m.id AS maintenance_id, m.description,
      m.next_due_date, m.next_due_km, m.completed_at
    FROM maintenances m
    JOIN trucks t ON t.id = m.truck_id
    WHERE m.type = 'preventiva' AND m.status = 'concluida'
      AND (m.next_due_date IS NOT NULL OR m.next_due_km IS NOT NULL)
      AND t.status <> 'inativo'
    ORDER BY m.truck_id, m.completed_at DESC
  ) p`;
