import { Router } from "express";
import { z } from "zod";
import { query, tx, type Queryable } from "../db.js";
import { HttpError, idParam } from "../auth.js";
import { bumpOdometer, lockTruck, releaseTruck, setTruckStatus } from "../fleet.js";
import { dateTime, optInt, optMoney, optText } from "../validation.js";

/**
 * Utilizações (saídas) dos guinchos.
 * Admin e operador veem e lançam tudo; o motorista vê e lança apenas as próprias.
 */
export const usagesRouter = Router();

const SELECT = `
  SELECT u.*, t.plate, t.model, d.name AS driver_name,
    CASE WHEN u.end_km IS NOT NULL THEN u.end_km - u.start_km END AS distance_km,
    (SELECT COALESCE(SUM(e.amount),0) FROM expenses e WHERE e.usage_id = u.id AND e.status <> 'recusada') AS expenses_total,
    (SELECT COUNT(*)::int FROM expenses e WHERE e.usage_id = u.id AND e.status <> 'recusada') AS expenses_count
  FROM usages u
  JOIN trucks t ON t.id = u.truck_id
  LEFT JOIN users d ON d.id = u.driver_id`;

usagesRouter.get("/", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (req.user!.role === "motorista") add("u.driver_id = ?", req.user!.id);
  else if (q.driver_id) add("u.driver_id = ?", Number(q.driver_id));
  if (q.truck_id) add("u.truck_id = ?", Number(q.truck_id));
  if (q.status) add("u.status = ?", q.status);
  if (q.from) add("u.started_at >= ?::date", q.from);
  if (q.to) add("u.started_at < ?::date + 1", q.to);
  if (q.q?.trim()) add("(u.client ILIKE ? OR u.service ILIKE ? OR u.destination ILIKE ? OR u.vehicle ILIKE ?)", `%${q.q.trim()}%`);
  const rows = await query(
    `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY u.status = 'em_andamento' DESC, u.started_at DESC LIMIT 500`,
    params,
  );
  res.json(rows);
});

const startSchema = z.object({
  truck_id: z.coerce.number().int().positive("Selecione o guincho"),
  driver_id: optInt(1),
  service: z.string().trim().min(2, "Descreva o serviço").max(200),
  client: optText(120),
  origin: optText(200),
  destination: optText(200),
  vehicle: optText(120),
  start_km: optInt(0),
  started_at: dateTime.optional().nullable(),
  notes: optText(1000),
  amount: optMoney,
});

/** Registra a saída: o guincho precisa estar disponível e passa para "em serviço". */
usagesRouter.post("/", async (req, res) => {
  const b = startSchema.parse(req.body);
  const user = req.user!;
  const driverId = user.role === "motorista" ? user.id : b.driver_id;
  // Valor cobrado é definido pelo escritório.
  const amount = user.role === "motorista" ? null : b.amount;
  const row = await tx(async (db) => {
    const truck = await lockTruck(db, b.truck_id);
    if (truck.status !== "disponivel") {
      const reason = { em_servico: "já está em serviço", manutencao: "está em manutenção", inativo: "está inativo" }[truck.status];
      throw new HttpError(400, `O guincho ${truck.plate} ${reason}`);
    }
    const startKm = b.start_km ?? truck.odometer_km;
    if (startKm < truck.odometer_km) throw new HttpError(400, `Km de saída menor que o hodômetro atual (${truck.odometer_km} km)`);
    const [u] = await db.query(
      `INSERT INTO usages (truck_id, driver_id, service, client, origin, destination, vehicle, start_km, started_at, notes, created_by, amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz, now()),$10,$11,$12) RETURNING *`,
      [b.truck_id, driverId, b.service, b.client, b.origin, b.destination, b.vehicle, startKm, b.started_at ?? null, b.notes, user.id, amount],
    );
    await bumpOdometer(db, b.truck_id, startKm);
    await setTruckStatus(db, b.truck_id, truck.status, "em_servico", user.id, `Saída: ${b.service}`);
    return u;
  });
  res.status(201).json(row);
});

async function getUsage(db: Queryable, id: number, userId: number, role: string) {
  const [u] = await db.query("SELECT * FROM usages WHERE id = $1 FOR UPDATE", [id]);
  if (!u || (role === "motorista" && u.driver_id !== userId)) throw new HttpError(404, "Utilização não encontrada");
  return u;
}

/** Registra o retorno: grava km final, atualiza o hodômetro e libera o guincho. */
usagesRouter.post("/:id/finish", async (req, res) => {
  const id = idParam(req);
  const b = z
    .object({
      end_km: z.coerce.number({ message: "Informe o km de chegada" }).int().min(0),
      ended_at: dateTime.optional().nullable(),
      notes: optText(1000),
      amount: optMoney,
    })
    .parse(req.body);
  await tx(async (db) => {
    const u = await getUsage(db, id, req.user!.id, req.user!.role);
    if (u.status !== "em_andamento") throw new HttpError(400, "Esta utilização já foi encerrada");
    if (b.end_km < u.start_km) throw new HttpError(400, `Km de chegada menor que o de saída (${u.start_km} km)`);
    if (b.ended_at && new Date(b.ended_at) < new Date(u.started_at)) throw new HttpError(400, "Chegada antes da saída");
    await db.query(
      "UPDATE usages SET status='concluida', end_km=$1, ended_at=COALESCE($2::timestamptz, now()), notes=COALESCE($3, notes), amount=COALESCE($4, amount) WHERE id=$5",
      [b.end_km, b.ended_at ?? null, b.notes, req.user!.role === "motorista" ? null : b.amount, id],
    );
    await bumpOdometer(db, u.truck_id, b.end_km);
    await releaseTruck(db, u.truck_id, req.user!.id, `Retorno: ${u.service} (${b.end_km - u.start_km} km)`);
  });
  res.json({ ok: true });
});

usagesRouter.post("/:id/cancel", async (req, res) => {
  const id = idParam(req);
  await tx(async (db) => {
    const u = await getUsage(db, id, req.user!.id, req.user!.role);
    if (u.status !== "em_andamento") throw new HttpError(400, "Esta utilização já foi encerrada");
    await db.query("UPDATE usages SET status='cancelada', ended_at=now() WHERE id=$1", [id]);
    await releaseTruck(db, u.truck_id, req.user!.id, `Saída cancelada: ${u.service}`);
  });
  res.json({ ok: true });
});

/** Correção de dados de uma utilização (admin/operador). */
usagesRouter.put("/:id", async (req, res) => {
  if (req.user!.role === "motorista") throw new HttpError(403, "Sem permissão para esta ação");
  const id = idParam(req);
  const b = z
    .object({
      driver_id: optInt(1),
      service: z.string().trim().min(2, "Descreva o serviço").max(200),
      client: optText(120),
      origin: optText(200),
      destination: optText(200),
      vehicle: optText(120),
      notes: optText(1000),
      amount: optMoney,
    })
    .parse(req.body);
  const [row] = await query(
    `UPDATE usages SET driver_id=$1, service=$2, client=$3, origin=$4, destination=$5, vehicle=$6, notes=$7, amount=$8 WHERE id=$9 RETURNING *`,
    [b.driver_id, b.service, b.client, b.origin, b.destination, b.vehicle, b.notes, b.amount, id],
  );
  if (!row) throw new HttpError(404, "Utilização não encontrada");
  res.json(row);
});
