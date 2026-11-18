import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { migrate } from "./schema.js";
import { HttpError, requireAuth, requireRole } from "./auth.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { trucksRouter } from "./routes/trucks.js";
import { maintenancesRouter } from "./routes/maintenances.js";
import { documentsRouter } from "./routes/documents.js";
import { usagesRouter } from "./routes/usages.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { expensesRouter } from "./routes/expenses.js";
import { financeRouter } from "./routes/finance.js";

// Cria as tabelas uma vez por instância.
let schemaReady: Promise<void> | null = null;
export function ensureSchema() {
  schemaReady ??= migrate().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

export const app = express();
app.use(cors());
// Limite maior por causa das fotos das notas (já chegam comprimidas do celular).
app.use(express.json({ limit: "15mb" }));
app.use("/api", async (_req, _res, next) => {
  await ensureSchema();
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/trucks", requireAuth, trucksRouter);
app.use("/api/maintenances", requireAuth, maintenancesRouter);
app.use("/api/documents", requireAuth, documentsRouter);
app.use("/api/usages", requireAuth, usagesRouter);
app.use("/api/expenses", requireAuth, expensesRouter);
app.use("/api/finance", requireAuth, requireRole("admin", "operador"), financeRouter);
app.use("/api/dashboard", requireAuth, requireRole("admin", "operador"), dashboardRouter);
app.use("/api", (_req, res) => res.status(404).json({ error: "Rota não encontrada" }));

/** Registrado por último. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message || "Dados inválidos" });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "Fotos muito grandes — tente com menos fotos" });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Violação de unicidade do Postgres (placa repetida, e-mail repetido...)
  if (err?.code === "23505") {
    const msg: Record<string, string> = {
      trucks_plate_key: "Já existe um guincho com essa placa",
      users_email_key: "Já existe um usuário com esse e-mail",
      usages_one_active_per_truck: "Este guincho já tem uma utilização em andamento",
      expenses_client_uuid_key: "Esta despesa já foi enviada",
    };
    res.status(409).json({ error: msg[err.constraint] || "Já existe um registro com esses dados" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor" });
};
