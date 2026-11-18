// Entrada da API como função serverless na Vercel (empacotada por scripts/vercel-build.mjs).
import type { IncomingMessage, ServerResponse } from "node:http";
import { app, errorHandler } from "./app.js";

app.use(errorHandler);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // A rota /api/(.*) chega como /api?__path=...; restaura a URL original para o Express.
  const url = new URL(req.url || "/", "http://localhost");
  const path = url.searchParams.get("__path");
  if (path !== null) {
    url.searchParams.delete("__path");
    const qs = url.searchParams.toString();
    req.url = `/api/${path}${qs ? `?${qs}` : ""}`;
  }
  return app(req as any, res as any);
}
