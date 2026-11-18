import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { query } from "./db.js";

export type Role = "admin" | "operador" | "motorista";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const SECRET = process.env.JWT_SECRET || "dev-secret-troque-isto";

export function signToken(userId: number) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: "7d" });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Não autenticado");
  let userId: number;
  try {
    const payload = jwt.verify(header.slice(7), SECRET) as unknown as { sub: number };
    userId = Number(payload.sub);
  } catch {
    throw new HttpError(401, "Sessão expirada, faça login novamente");
  }
  // Busca no banco a cada requisição para refletir desativação ou troca de nível na hora.
  const [user] = await query<AuthUser & { active: boolean }>(
    "SELECT id, name, email, role, active FROM users WHERE id = $1",
    [userId],
  );
  if (!user || !user.active) throw new HttpError(401, "Usuário inativo");
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw new HttpError(403, "Sem permissão para esta ação");
    next();
  };
}

/** Converte o :id da rota em número ou devolve 404. */
export function idParam(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, "Registro não encontrado");
  return id;
}
