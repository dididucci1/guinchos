import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db.js";
import { HttpError, idParam, requireRole } from "../auth.js";
import { optDate, optText } from "../validation.js";

export const usersRouter = Router();

const COLS = "id, name, email, role, phone, cnh_number, cnh_expiry, active, created_at";

/** Motoristas ativos — usado nos formulários de saída. */
usersRouter.get("/drivers", requireRole("admin", "operador"), async (_req, res) => {
  res.json(await query("SELECT id, name, phone, cnh_expiry FROM users WHERE role = 'motorista' AND active ORDER BY name"));
});

usersRouter.use(requireRole("admin"));

usersRouter.get("/", async (_req, res) => {
  res.json(await query(`SELECT ${COLS} FROM users ORDER BY active DESC, name`));
});

const base = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(["admin", "operador", "motorista"]),
  phone: optText(40),
  cnh_number: optText(40),
  cnh_expiry: optDate,
  active: z.boolean().optional(),
});

usersRouter.post("/", async (req, res) => {
  const body = base.extend({ password: z.string().min(3, "Senha com pelo menos 3 caracteres") }).parse(req.body);
  const [user] = await query(
    `INSERT INTO users (name, email, password_hash, role, phone, cnh_number, cnh_expiry)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLS}`,
    [body.name, body.email, await bcrypt.hash(body.password, 10), body.role, body.phone, body.cnh_number, body.cnh_expiry],
  );
  res.status(201).json(user);
});

usersRouter.put("/:id", async (req, res) => {
  const id = idParam(req);
  const body = base.extend({ password: z.string().min(3).optional().or(z.literal("")) }).parse(req.body);
  if (id === req.user!.id && (body.role !== "admin" || body.active === false)) {
    throw new HttpError(400, "Você não pode remover o próprio acesso de administrador");
  }
  const [user] = await query(
    `UPDATE users SET name=$1, email=$2, role=$3, phone=$4, cnh_number=$5, cnh_expiry=$6, active=COALESCE($7, active)
     WHERE id=$8 RETURNING ${COLS}`,
    [body.name, body.email, body.role, body.phone, body.cnh_number, body.cnh_expiry, body.active ?? null, id],
  );
  if (!user) throw new HttpError(404, "Usuário não encontrado");
  if (body.password) await query("UPDATE users SET password_hash=$1 WHERE id=$2", [await bcrypt.hash(body.password, 10), id]);
  res.json(user);
});
