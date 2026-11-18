// Servidor local / produção tradicional (npm run dev, npm start).
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { app, ensureSchema, errorHandler } from "./app.js";

// Serve o front compilado (web/dist) quando existir.
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}
app.use(errorHandler);

const port = Number(process.env.PORT) || 3002;
ensureSchema()
  .then(() => app.listen(port, () => console.log(`API rodando em http://localhost:${port}`)))
  .catch((err) => {
    console.error("Falha ao conectar/migrar o banco:", err);
    process.exit(1);
  });
