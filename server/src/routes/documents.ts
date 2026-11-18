import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";
import { HttpError, idParam, requireRole } from "../auth.js";
import { CURRENT_DOCS_SQL, DOC_WARN_DAYS } from "../fleet.js";
import { optDate, optMoney, optText } from "../validation.js";

export const documentsRouter = Router();
documentsRouter.use(requireRole("admin", "operador"));

const ALL_DOCS_SQL = `
  SELECT d.*, t.plate, t.model,
    CASE
      WHEN d.expiry_date IS NULL THEN 'sem_validade'
      WHEN d.expiry_date < CURRENT_DATE THEN 'vencido'
      WHEN d.expiry_date <= CURRENT_DATE + ${DOC_WARN_DAYS} THEN 'a_vencer'
      ELSE 'em_dia'
    END AS situation,
    (d.expiry_date - CURRENT_DATE) AS days_left
  FROM documents d JOIN trucks t ON t.id = d.truck_id`;

/**
 * Por padrão lista só o documento vigente de cada tipo (o de validade mais longa).
 * Com ?historico=1 traz também os já substituídos por uma renovação.
 */
documentsRouter.get("/", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.truck_id) {
    params.push(Number(q.truck_id));
    where.push(`x.truck_id = $${params.length}`);
  }
  if (q.situation) {
    params.push(q.situation);
    where.push(`x.situation = $${params.length}`);
  }
  if (q.type) {
    params.push(q.type);
    where.push(`x.type = $${params.length}`);
  }
  const source = q.historico === "1" ? ALL_DOCS_SQL : CURRENT_DOCS_SQL;
  res.json(
    await query(
      `SELECT * FROM (${source}) x ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY x.expiry_date ASC NULLS LAST, x.plate`,
      params,
    ),
  );
});

const schema = z.object({
  truck_id: z.coerce.number().int().positive("Selecione o guincho"),
  type: z.enum(["crlv", "licenciamento", "ipva", "seguro", "antt", "tacografo", "inspecao", "outro"]),
  number: optText(80),
  issue_date: optDate,
  expiry_date: optDate,
  amount: optMoney,
  notes: optText(1000),
});

documentsRouter.post("/", async (req, res) => {
  const b = schema.parse(req.body);
  const [row] = await query(
    `INSERT INTO documents (truck_id, type, number, issue_date, expiry_date, amount, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.truck_id, b.type, b.number, b.issue_date, b.expiry_date, b.amount, b.notes],
  );
  res.status(201).json(row);
});

documentsRouter.put("/:id", async (req, res) => {
  const id = idParam(req);
  const b = schema.parse(req.body);
  const [row] = await query(
    `UPDATE documents SET truck_id=$1, type=$2, number=$3, issue_date=$4, expiry_date=$5, amount=$6, notes=$7
     WHERE id=$8 RETURNING *`,
    [b.truck_id, b.type, b.number, b.issue_date, b.expiry_date, b.amount, b.notes, id],
  );
  if (!row) throw new HttpError(404, "Documento não encontrado");
  res.json(row);
});

documentsRouter.delete("/:id", requireRole("admin"), async (req, res) => {
  await query("DELETE FROM documents WHERE id=$1", [idParam(req)]);
  res.json({ ok: true });
});
