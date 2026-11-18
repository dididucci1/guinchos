import { Router, type Request } from "express";
import { z } from "zod";
import { query, tx, type Queryable } from "../db.js";
import { HttpError, idParam, requireRole } from "../auth.js";
import { dateTime, optInt, optText } from "../validation.js";

/**
 * Despesas de viagem (pneu, combustível, pedágio...) com foto da nota.
 * O motorista lança e vê só as dele; admin e operador conferem (aprovam/recusam) e marcam o reembolso.
 */
export const expensesRouter = Router();

export const EXPENSE_CATEGORIES = [
  "combustivel",
  "pedagio",
  "pneu",
  "mecanica",
  "alimentacao",
  "hospedagem",
  "estacionamento",
  "lavagem",
  "multa",
  "outro",
] as const;

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MIMES = ["image/jpeg", "image/png", "image/webp"];

const SELECT = `
  SELECT e.*, t.plate, t.model, d.name AS driver_name, rv.name AS reviewed_by_name,
    u.service AS usage_service, u.client AS usage_client, u.started_at AS usage_started_at,
    COALESCE((SELECT json_agg(p.id ORDER BY p.id) FROM expense_photos p WHERE p.expense_id = e.id), '[]'::json) AS photo_ids
  FROM expenses e
  LEFT JOIN trucks t ON t.id = e.truck_id
  LEFT JOIN users d ON d.id = e.driver_id
  LEFT JOIN users rv ON rv.id = e.reviewed_by
  LEFT JOIN usages u ON u.id = e.usage_id`;

const isGestao = (req: Request) => req.user!.role !== "motorista";

expensesRouter.get("/", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (!isGestao(req)) add("e.driver_id = ?", req.user!.id);
  else if (q.driver_id) add("e.driver_id = ?", Number(q.driver_id));
  if (q.truck_id) add("e.truck_id = ?", Number(q.truck_id));
  if (q.usage_id) add("e.usage_id = ?", Number(q.usage_id));
  if (q.status) add("e.status = ?", q.status);
  if (q.category) add("e.category = ?", q.category);
  if (q.from) add("e.spent_at >= ?::date", q.from);
  if (q.to) add("e.spent_at < ?::date + 1", q.to);
  if (q.reembolsar === "1") where.push("e.status = 'aprovada' AND e.paid_by = 'motorista' AND e.reimbursed_at IS NULL");
  if (q.q?.trim()) add("(e.description ILIKE ? OR d.name ILIKE ? OR t.plate ILIKE ?)", `%${q.q.trim()}%`);
  const rows = await query(
    `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY e.status = 'pendente' DESC, e.spent_at DESC, e.id DESC LIMIT 500`,
    params,
  );
  res.json(rows);
});

/** Foto da nota (ou miniatura com ?size=thumb). */
expensesRouter.get("/photos/:id", async (req, res) => {
  const id = idParam(req);
  const thumb = req.query.size === "thumb";
  const [p] = await query<{ mime: string; img: Uint8Array; driver_id: number | null }>(
    `SELECT p.mime, ${thumb ? "COALESCE(p.thumb, p.data)" : "p.data"} AS img, e.driver_id
     FROM expense_photos p JOIN expenses e ON e.id = p.expense_id WHERE p.id = $1`,
    [id],
  );
  if (!p || (!isGestao(req) && p.driver_id !== req.user!.id)) throw new HttpError(404, "Foto não encontrada");
  res.setHeader("Content-Type", thumb ? "image/jpeg" : p.mime);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(Buffer.from(p.img));
});

/** "data:image/jpeg;base64,..." → bytes, validando tipo e tamanho. */
function decodeImage(dataUrl: string) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl);
  if (!m || !MIMES.includes(m[1])) throw new HttpError(400, "Envie a foto em JPG, PNG ou WEBP");
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length) throw new HttpError(400, "Foto vazia");
  if (buf.length > MAX_PHOTO_BYTES) throw new HttpError(400, "Foto muito grande (máx. 4 MB)");
  return { mime: m[1], buf };
}

const photoSchema = z.object({ data: z.string(), thumb: z.string().optional().nullable() });

const money = z.coerce.number({ message: "Informe o valor" }).positive("Informe o valor da despesa").max(1_000_000, "Valor muito alto");

const baseSchema = z.object({
  truck_id: optInt(1),
  usage_id: optInt(1),
  driver_id: optInt(1),
  category: z.enum(EXPENSE_CATEGORIES, { message: "Escolha o tipo da despesa" }),
  amount: money,
  spent_at: dateTime.optional().nullable(),
  description: optText(500),
  odometer_km: optInt(0),
  liters: z
    .union([z.literal(""), z.null(), z.coerce.number().positive("Litros inválidos").max(5000)])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
  paid_by: z.enum(["motorista", "empresa"]).default("motorista"),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
});

const createSchema = baseSchema.extend({
  client_uuid: z.string().trim().max(64).optional().nullable(),
  photos: z.array(photoSchema).max(MAX_PHOTOS, `No máximo ${MAX_PHOTOS} fotos`).default([]),
});

const updateSchema = baseSchema.extend({
  photos: z.array(photoSchema).max(MAX_PHOTOS).default([]),
  remove_photo_ids: z.array(z.number().int()).default([]),
});

/** Resolve guincho/motorista a partir da viagem e aplica as regras de acesso. */
async function resolveLinks(db: Queryable, req: Request, b: z.infer<typeof baseSchema>) {
  let truckId = b.truck_id;
  let driverId = isGestao(req) ? b.driver_id : req.user!.id;
  if (b.usage_id) {
    const [u] = await db.query<{ truck_id: number; driver_id: number | null }>("SELECT truck_id, driver_id FROM usages WHERE id = $1", [b.usage_id]);
    if (!u || (!isGestao(req) && u.driver_id !== req.user!.id)) throw new HttpError(400, "Viagem não encontrada");
    truckId = u.truck_id;
    if (isGestao(req) && !driverId) driverId = u.driver_id;
  }
  if (!truckId) throw new HttpError(400, "Selecione o guincho ou a viagem");
  const [t] = await db.query("SELECT id FROM trucks WHERE id = $1", [truckId]);
  if (!t) throw new HttpError(400, "Guincho não encontrado");
  return { truckId, driverId: driverId ?? null };
}

async function insertPhotos(db: Queryable, expenseId: number, photos: z.infer<typeof photoSchema>[]) {
  for (const p of photos) {
    const full = decodeImage(p.data);
    const thumb = p.thumb ? decodeImage(p.thumb).buf : null;
    await db.query("INSERT INTO expense_photos (expense_id, mime, data, thumb) VALUES ($1,$2,$3,$4)", [expenseId, full.mime, full.buf, thumb]);
  }
}

async function loadOne(id: number) {
  const [row] = await query(`${SELECT} WHERE e.id = $1`, [id]);
  return row;
}

expensesRouter.post("/", async (req, res) => {
  const b = createSchema.parse(req.body);
  // Reenvio da fila offline: se já recebemos, devolve o mesmo registro.
  if (b.client_uuid) {
    const [dup] = await query<{ id: number }>("SELECT id FROM expenses WHERE client_uuid = $1", [b.client_uuid]);
    if (dup) {
      res.status(200).json(await loadOne(dup.id));
      return;
    }
  }
  const id = await tx(async (db) => {
    const { truckId, driverId } = await resolveLinks(db, req, b);
    const [e] = await db.query<{ id: number }>(
      `INSERT INTO expenses (client_uuid, truck_id, usage_id, driver_id, category, amount, spent_at, description, odometer_km, liters, paid_by, lat, lng, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, now()),$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [b.client_uuid || null, truckId, b.usage_id, driverId, b.category, b.amount, b.spent_at ?? null, b.description, b.odometer_km, b.liters, b.paid_by, b.lat ?? null, b.lng ?? null, req.user!.id],
    );
    await insertPhotos(db, e.id, b.photos);
    return e.id;
  });
  res.status(201).json(await loadOne(id));
});

async function getExpense(db: Queryable, req: Request, id: number) {
  const [e] = await db.query("SELECT * FROM expenses WHERE id = $1 FOR UPDATE", [id]);
  if (!e || (!isGestao(req) && e.driver_id !== req.user!.id)) throw new HttpError(404, "Despesa não encontrada");
  return e;
}

expensesRouter.put("/:id", async (req, res) => {
  const id = idParam(req);
  const b = updateSchema.parse(req.body);
  await tx(async (db) => {
    const e = await getExpense(db, req, id);
    if (!isGestao(req) && e.status !== "pendente") throw new HttpError(400, "Despesa já conferida — fale com o escritório para corrigir");
    const { truckId, driverId } = await resolveLinks(db, req, b);
    await db.query(
      `UPDATE expenses SET truck_id=$1, usage_id=$2, driver_id=$3, category=$4, amount=$5, spent_at=COALESCE($6::timestamptz, spent_at),
         description=$7, odometer_km=$8, liters=$9, paid_by=$10 WHERE id=$11`,
      [truckId, b.usage_id, driverId, b.category, b.amount, b.spent_at ?? null, b.description, b.odometer_km, b.liters, b.paid_by, id],
    );
    if (b.remove_photo_ids.length) await db.query("DELETE FROM expense_photos WHERE expense_id = $1 AND id = ANY($2)", [id, b.remove_photo_ids]);
    const [{ n }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM expense_photos WHERE expense_id = $1", [id]);
    if (n + b.photos.length > MAX_PHOTOS) throw new HttpError(400, `No máximo ${MAX_PHOTOS} fotos por despesa`);
    await insertPhotos(db, id, b.photos);
  });
  res.json(await loadOne(id));
});

/** Conferência: aprovar, recusar ou voltar para pendente. */
expensesRouter.post("/:id/review", requireRole("admin", "operador"), async (req, res) => {
  const id = idParam(req);
  const b = z.object({ status: z.enum(["aprovada", "recusada", "pendente"]), note: optText(500) }).parse(req.body);
  if (b.status === "recusada" && !b.note) throw new HttpError(400, "Diga o motivo da recusa para o motorista");
  const pending = b.status === "pendente";
  const [row] = await query(
    `UPDATE expenses SET status=$1, review_note=$2, reviewed_by=$3, reviewed_at=$4,
       reimbursed_at = CASE WHEN $1 = 'aprovada' THEN reimbursed_at END
     WHERE id=$5 RETURNING id`,
    [b.status, b.note, pending ? null : req.user!.id, pending ? null : new Date().toISOString(), id],
  );
  if (!row) throw new HttpError(404, "Despesa não encontrada");
  res.json(await loadOne(id));
});

/** Marca despesas pagas pelo motorista como reembolsadas (ou desfaz). */
expensesRouter.post("/reimburse", requireRole("admin", "operador"), async (req, res) => {
  const b = z.object({ ids: z.array(z.number().int()).min(1, "Selecione as despesas"), undo: z.boolean().optional() }).parse(req.body);
  const rows = await query(
    b.undo
      ? "UPDATE expenses SET reimbursed_at = NULL WHERE id = ANY($1) RETURNING id"
      : `UPDATE expenses SET reimbursed_at = now()
         WHERE id = ANY($1) AND status = 'aprovada' AND paid_by = 'motorista' AND reimbursed_at IS NULL RETURNING id`,
    [b.ids],
  );
  res.json({ updated: rows.length });
});

expensesRouter.delete("/:id", async (req, res) => {
  const id = idParam(req);
  await tx(async (db) => {
    const e = await getExpense(db, req, id);
    if (!isGestao(req) && e.status !== "pendente") throw new HttpError(400, "Despesa já conferida não pode ser excluída");
    await db.query("DELETE FROM expenses WHERE id = $1", [id]);
  });
  res.json({ ok: true });
});
