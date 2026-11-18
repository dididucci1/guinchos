import { Router } from "express";
import { z } from "zod";
import { query, tx } from "../db.js";
import { HttpError, idParam, requireRole } from "../auth.js";
import { DOC_WARN_DAYS, lockTruck, setTruckStatus } from "../fleet.js";
import { optInt, optText } from "../validation.js";

export const trucksRouter = Router();

/**
 * Lista com a situação atual de cada guincho: utilização em andamento,
 * manutenção aberta e quantidade de documentos vencidos ou a vencer.
 */
const LIST_SQL = `
  SELECT t.*,
    u.id AS usage_id, u.service AS usage_service, u.client AS usage_client, u.destination AS usage_destination,
    u.started_at AS usage_started_at, u.start_km AS usage_start_km, u.driver_id AS usage_driver_id, dr.name AS usage_driver,
    (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.usage_id = u.id AND e.status <> 'recusada') AS usage_expenses,
    m.id AS maintenance_id, m.description AS maintenance_description, m.type AS maintenance_type,
    (SELECT COUNT(*)::int FROM documents d
       WHERE d.truck_id = t.id AND d.expiry_date IS NOT NULL AND d.expiry_date <= CURRENT_DATE + ${DOC_WARN_DAYS}
         AND NOT EXISTS (SELECT 1 FROM documents n WHERE n.truck_id = d.truck_id AND n.type = d.type
                         AND n.type <> 'outro' AND COALESCE(n.expiry_date,'9999-12-31') > d.expiry_date)
    ) AS doc_alerts
  FROM trucks t
  LEFT JOIN usages u ON u.truck_id = t.id AND u.status = 'em_andamento'
  LEFT JOIN users dr ON dr.id = u.driver_id
  LEFT JOIN LATERAL (
    SELECT id, description, type FROM maintenances
    WHERE truck_id = t.id AND status = 'em_andamento' ORDER BY started_at DESC LIMIT 1
  ) m ON TRUE`;

trucksRouter.get("/", async (req, res) => {
  const where: string[] = [];
  const params: unknown[] = [];
  if (typeof req.query.status === "string" && req.query.status) {
    params.push(req.query.status);
    where.push(`t.status = $${params.length}`);
  }
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    params.push(`%${req.query.q.trim()}%`);
    const p = `$${params.length}`;
    where.push(`(t.plate ILIKE ${p} OR t.model ILIKE ${p} OR t.brand ILIKE ${p})`);
  }
  const sql = `${LIST_SQL} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY t.status = 'inativo', t.plate`;
  res.json(await query(sql, params));
});

trucksRouter.get("/:id", async (req, res) => {
  const id = idParam(req);
  const [truck] = await query(`${LIST_SQL} WHERE t.id = $1`, [id]);
  if (!truck) throw new HttpError(404, "Guincho não encontrado");
  const events = await query(
    `SELECT e.*, u.name AS user_name FROM truck_events e LEFT JOIN users u ON u.id = e.user_id
     WHERE e.truck_id = $1 ORDER BY e.created_at DESC, e.id DESC LIMIT 30`,
    [id],
  );
  const [stats] = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM usages WHERE truck_id = $1 AND status = 'concluida') AS total_services,
       (SELECT COALESCE(SUM(end_km - start_km),0)::int FROM usages WHERE truck_id = $1 AND status = 'concluida') AS total_km,
       (SELECT COALESCE(SUM(end_km - start_km),0)::int FROM usages WHERE truck_id = $1 AND status = 'concluida'
          AND started_at >= date_trunc('month', now())) AS month_km,
       (SELECT COALESCE(SUM(cost),0) FROM maintenances WHERE truck_id = $1 AND status = 'concluida') AS maintenance_cost`,
    [id],
  );
  res.json({ ...truck, events, stats });
});

const plate = z
  .string()
  .trim()
  .toUpperCase()
  .transform((v) => v.replace(/[^A-Z0-9]/g, ""))
  .refine((v) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(v), "Placa inválida (ex.: ABC1D23 ou ABC1234)");

const truckSchema = z.object({
  plate,
  brand: optText(60),
  model: z.string().trim().min(1, "Informe o modelo").max(100),
  year: optInt(1950),
  kind: z.enum(["plataforma", "asa_delta", "lanca", "integrado", "pesado"]),
  capacity_kg: z.coerce.number({ message: "Informe a capacidade" }).int().positive("Capacidade deve ser maior que zero"),
  odometer_km: z.coerce.number().int().min(0, "Quilometragem inválida"),
  location: optText(120),
  notes: optText(1000),
});

trucksRouter.post("/", requireRole("admin", "operador"), async (req, res) => {
  const b = truckSchema.parse(req.body);
  const truck = await tx(async (db) => {
    const [t] = await db.query(
      `INSERT INTO trucks (plate, brand, model, year, kind, capacity_kg, odometer_km, location, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.plate, b.brand, b.model, b.year, b.kind, b.capacity_kg, b.odometer_km, b.location, b.notes],
    );
    await db.query("INSERT INTO truck_events (truck_id, user_id, to_status, note) VALUES ($1,$2,'disponivel','Guincho cadastrado')", [
      t.id,
      req.user!.id,
    ]);
    return t;
  });
  res.status(201).json(truck);
});

trucksRouter.put("/:id", requireRole("admin", "operador"), async (req, res) => {
  const id = idParam(req);
  const b = truckSchema.parse(req.body);
  const [current] = await query<{ odometer_km: number }>("SELECT odometer_km FROM trucks WHERE id = $1", [id]);
  if (!current) throw new HttpError(404, "Guincho não encontrado");
  // Só o administrador pode corrigir a quilometragem para baixo.
  if (b.odometer_km < current.odometer_km && req.user!.role !== "admin") {
    throw new HttpError(400, `A quilometragem não pode ser menor que a atual (${current.odometer_km} km)`);
  }
  const [truck] = await query(
    `UPDATE trucks SET plate=$1, brand=$2, model=$3, year=$4, kind=$5, capacity_kg=$6, odometer_km=$7, location=$8, notes=$9
     WHERE id=$10 RETURNING *`,
    [b.plate, b.brand, b.model, b.year, b.kind, b.capacity_kg, b.odometer_km, b.location, b.notes, id],
  );
  res.json(truck);
});

/** Atualização rápida de quilometragem e localização (quadro de disponibilidade). */
trucksRouter.patch("/:id/position", requireRole("admin", "operador"), async (req, res) => {
  const id = idParam(req);
  const b = z.object({ odometer_km: optInt(0), location: optText(120) }).parse(req.body);
  const [truck] = await query("SELECT odometer_km FROM trucks WHERE id = $1", [id]);
  if (!truck) throw new HttpError(404, "Guincho não encontrado");
  if (b.odometer_km != null && b.odometer_km < truck.odometer_km) {
    throw new HttpError(400, `A quilometragem não pode ser menor que a atual (${truck.odometer_km} km)`);
  }
  const [updated] = await query(
    "UPDATE trucks SET odometer_km = COALESCE($1, odometer_km), location = $2 WHERE id = $3 RETURNING *",
    [b.odometer_km, b.location, id],
  );
  res.json(updated);
});

/**
 * Status manual: só "disponível" e "inativo".
 * "Em serviço" e "manutenção" mudam sozinhos pelas utilizações e manutenções.
 */
trucksRouter.patch("/:id/status", requireRole("admin", "operador"), async (req, res) => {
  const id = idParam(req);
  const b = z.object({ status: z.enum(["disponivel", "inativo"]), note: optText(300) }).parse(req.body);
  await tx(async (db) => {
    const truck = await lockTruck(db, id);
    if (truck.status === "em_servico") throw new HttpError(400, "Finalize a utilização em andamento antes de mudar o status");
    if (truck.status === "manutencao") throw new HttpError(400, "Conclua ou cancele a manutenção em andamento antes de mudar o status");
    await setTruckStatus(db, id, truck.status, b.status, req.user!.id, b.note);
  });
  res.json({ ok: true });
});

trucksRouter.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = idParam(req);
  const [{ n }] = await query<{ n: number }>("SELECT COUNT(*)::int AS n FROM usages WHERE truck_id = $1", [id]);
  if (n > 0) throw new HttpError(400, "Guincho com histórico de utilização não pode ser excluído — marque como inativo");
  await query("DELETE FROM trucks WHERE id = $1", [id]);
  res.json({ ok: true });
});
