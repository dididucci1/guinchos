import { Router } from "express";
import { z } from "zod";
import { query, tx, type Queryable } from "../db.js";
import { HttpError, idParam, requireRole } from "../auth.js";
import { bumpOdometer, lockTruck, PREVENTIVE_DUE_SQL, releaseTruck, setTruckStatus } from "../fleet.js";
import { optDate, optInt, optMoney, optText } from "../validation.js";

export const maintenancesRouter = Router();
maintenancesRouter.use(requireRole("admin", "operador"));

const SELECT = `
  SELECT m.*, t.plate, t.model, t.status AS truck_status, u.name AS created_by_name
  FROM maintenances m
  JOIN trucks t ON t.id = m.truck_id
  LEFT JOIN users u ON u.id = m.created_by`;

maintenancesRouter.get("/", async (req, res) => {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  const q = req.query as Record<string, string | undefined>;
  if (q.truck_id) add("m.truck_id = ?", Number(q.truck_id));
  if (q.status) add("m.status = ?", q.status);
  if (q.closed === "1") where.push("m.status IN ('concluida','cancelada')");
  if (q.open === "1") where.push("m.status IN ('agendada','em_andamento')");
  if (q.q?.trim()) add("(m.description ILIKE ? OR m.provider ILIKE ?)", `%${q.q.trim()}%`);
  if (q.type) add("m.type = ?", q.type);
  if (q.from) add("COALESCE(m.completed_at::date, m.scheduled_date, m.created_at::date) >= ?", q.from);
  if (q.to) add("COALESCE(m.completed_at::date, m.scheduled_date, m.created_at::date) <= ?", q.to);
  const rows = await query(
    `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY CASE m.status WHEN 'em_andamento' THEN 0 WHEN 'agendada' THEN 1 ELSE 2 END,
              CASE WHEN m.status = 'agendada' THEN m.scheduled_date END ASC NULLS LAST,
              COALESCE(m.completed_at, m.created_at) DESC
     LIMIT 500`,
    params,
  );
  res.json(rows);
});

/** Próximas preventivas de cada guincho (vencidas, próximas e em dia). */
maintenancesRouter.get("/due", async (_req, res) => {
  res.json(
    await query(`SELECT * FROM (${PREVENTIVE_DUE_SQL}) x
      ORDER BY CASE situation WHEN 'vencida' THEN 0 WHEN 'proxima' THEN 1 ELSE 2 END, next_due_date NULLS LAST`),
  );
});

const schema = z.object({
  truck_id: z.coerce.number().int().positive("Selecione o guincho"),
  type: z.enum(["preventiva", "corretiva"]),
  description: z.string().trim().min(3, "Descreva o serviço").max(500),
  scheduled_date: optDate,
  odometer_km: optInt(0),
  cost: optMoney,
  provider: optText(120),
  next_due_date: optDate,
  next_due_km: optInt(0),
  notes: optText(1000),
});

/** Coloca o guincho em manutenção. */
async function startOn(db: Queryable, maintenanceId: number, truckId: number, userId: number, description: string) {
  const truck = await lockTruck(db, truckId);
  if (truck.status === "em_servico") throw new HttpError(400, `O guincho ${truck.plate} está em serviço. Finalize a utilização primeiro.`);
  await db.query("UPDATE maintenances SET status = 'em_andamento', started_at = now() WHERE id = $1", [maintenanceId]);
  if (truck.status !== "inativo") await setTruckStatus(db, truckId, truck.status, "manutencao", userId, `Manutenção: ${description}`);
}

maintenancesRouter.post("/", async (req, res) => {
  const b = schema.extend({ start_now: z.boolean().optional() }).parse(req.body);
  const row = await tx(async (db) => {
    const [m] = await db.query(
      `INSERT INTO maintenances (truck_id, type, description, scheduled_date, odometer_km, cost, provider, next_due_date, next_due_km, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.truck_id, b.type, b.description, b.scheduled_date, b.odometer_km, b.cost, b.provider, b.next_due_date, b.next_due_km, b.notes, req.user!.id],
    );
    if (!b.start_now) return m;
    await startOn(db, m.id, b.truck_id, req.user!.id, b.description);
    return (await db.query("SELECT * FROM maintenances WHERE id = $1", [m.id]))[0];
  });
  res.status(201).json(row);
});

async function getMaintenance(db: Queryable, id: number) {
  const [m] = await db.query("SELECT * FROM maintenances WHERE id = $1 FOR UPDATE", [id]);
  if (!m) throw new HttpError(404, "Manutenção não encontrada");
  return m;
}

maintenancesRouter.put("/:id", async (req, res) => {
  const id = idParam(req);
  const b = schema.parse(req.body);
  const row = await tx(async (db) => {
    const m = await getMaintenance(db, id);
    if (m.truck_id !== b.truck_id && m.status !== "agendada") throw new HttpError(400, "Só é possível trocar o guincho de uma manutenção agendada");
    const [u] = await db.query(
      `UPDATE maintenances SET truck_id=$1, type=$2, description=$3, scheduled_date=$4, odometer_km=$5, cost=$6, provider=$7,
         next_due_date=$8, next_due_km=$9, notes=$10 WHERE id=$11 RETURNING *`,
      [b.truck_id, b.type, b.description, b.scheduled_date, b.odometer_km, b.cost, b.provider, b.next_due_date, b.next_due_km, b.notes, id],
    );
    if (u.status === "concluida") await bumpOdometer(db, u.truck_id, u.odometer_km);
    return u;
  });
  res.json(row);
});

maintenancesRouter.post("/:id/start", async (req, res) => {
  const id = idParam(req);
  await tx(async (db) => {
    const m = await getMaintenance(db, id);
    if (m.status !== "agendada") throw new HttpError(400, "Só manutenções agendadas podem ser iniciadas");
    await startOn(db, id, m.truck_id, req.user!.id, m.description);
  });
  res.json({ ok: true });
});

maintenancesRouter.post("/:id/complete", async (req, res) => {
  const id = idParam(req);
  const b = z
    .object({
      odometer_km: optInt(0),
      cost: optMoney,
      provider: optText(120),
      next_due_date: optDate,
      next_due_km: optInt(0),
      notes: optText(1000),
    })
    .parse(req.body);
  await tx(async (db) => {
    const m = await getMaintenance(db, id);
    if (!["agendada", "em_andamento"].includes(m.status)) throw new HttpError(400, "Esta manutenção já foi encerrada");
    await db.query(
      `UPDATE maintenances SET status='concluida', completed_at=now(), started_at=COALESCE(started_at, now()),
         odometer_km=COALESCE($1, odometer_km), cost=COALESCE($2, cost), provider=COALESCE($3, provider),
         next_due_date=COALESCE($4, next_due_date), next_due_km=COALESCE($5, next_due_km), notes=COALESCE($6, notes)
       WHERE id=$7`,
      [b.odometer_km, b.cost, b.provider, b.next_due_date, b.next_due_km, b.notes, id],
    );
    await bumpOdometer(db, m.truck_id, b.odometer_km ?? m.odometer_km);
    await releaseTruck(db, m.truck_id, req.user!.id, `Manutenção concluída: ${m.description}`);
  });
  res.json({ ok: true });
});

maintenancesRouter.post("/:id/cancel", async (req, res) => {
  const id = idParam(req);
  await tx(async (db) => {
    const m = await getMaintenance(db, id);
    if (!["agendada", "em_andamento"].includes(m.status)) throw new HttpError(400, "Esta manutenção já foi encerrada");
    await db.query("UPDATE maintenances SET status='cancelada' WHERE id=$1", [id]);
    if (m.status === "em_andamento") await releaseTruck(db, m.truck_id, req.user!.id, `Manutenção cancelada: ${m.description}`);
  });
  res.json({ ok: true });
});

maintenancesRouter.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = idParam(req);
  await tx(async (db) => {
    const m = await getMaintenance(db, id);
    await db.query("DELETE FROM maintenances WHERE id=$1", [id]);
    if (m.status === "em_andamento") await releaseTruck(db, m.truck_id, req.user!.id, "Manutenção excluída");
  });
  res.json({ ok: true });
});
