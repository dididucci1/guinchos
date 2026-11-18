import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db.js";
import { HttpError, requireAuth, signToken } from "../auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const [user] = await query("SELECT id, name, email, role, active, password_hash FROM users WHERE email = $1", [email]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, "E-mail ou senha incorretos");
  }
  if (!user.active) throw new HttpError(403, "Usuário desativado. Fale com o administrador.");
  const { password_hash, active, ...publicUser } = user;
  res.json({ token: signToken(user.id), user: publicUser });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

const passwordSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(3, "A nova senha precisa ter pelo menos 3 caracteres"),
});

authRouter.post("/password", requireAuth, async (req, res) => {
  const { current, next } = passwordSchema.parse(req.body);
  const [row] = await query("SELECT password_hash FROM users WHERE id = $1", [req.user!.id]);
  if (!(await bcrypt.compare(current, row.password_hash))) throw new HttpError(400, "Senha atual incorreta");
  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(next, 10), req.user!.id]);
  res.json({ ok: true });
});
