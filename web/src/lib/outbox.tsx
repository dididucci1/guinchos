import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, tokenStore } from "./api";

/**
 * Fila de envio offline das despesas.
 * Na estrada o sinal cai: se o envio falhar por falta de internet, a despesa (com as fotos)
 * fica guardada no celular e é reenviada sozinha quando a conexão voltar.
 * O `client_uuid` evita duplicar a despesa se um envio chegou mas a resposta se perdeu.
 */
export interface OutboxItem {
  uuid: string;
  body: Record<string, unknown>;
  createdAt: number;
  error?: string;
}

const DB_NAME = "guinchos";
const STORE = "outbox";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "uuid" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

// Sem IndexedDB (aba privada antiga etc.) a fila vive só na memória.
const memory = new Map<string, OutboxItem>();
const store = {
  all: async (): Promise<OutboxItem[]> => {
    try { return await run("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>); } catch { return [...memory.values()]; }
  },
  put: async (item: OutboxItem) => {
    try { await run("readwrite", (s) => s.put(item)); } catch { memory.set(item.uuid, item); }
  },
  del: async (uuid: string) => {
    try { await run("readwrite", (s) => s.delete(uuid)); } catch { /* */ }
    memory.delete(uuid);
  },
};

export function newUuid() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch { /* contexto sem https */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Falha de rede (sem resposta do servidor), em vez de erro de validação. */
const isNetworkError = (e: unknown) => !(e instanceof ApiError) || e.status === 0 || e.status >= 502;

export const notifyExpensesChanged = () => window.dispatchEvent(new Event("expenses:changed"));

interface OutboxCtx {
  items: OutboxItem[];
  syncing: boolean;
  /** Envia a despesa; sem internet, guarda na fila. */
  send: (body: Record<string, unknown>) => Promise<"sent" | "queued">;
  flush: () => Promise<void>;
  discard: (uuid: string) => Promise<void>;
}

const Ctx = createContext<OutboxCtx>(null!);
export const useOutbox = () => useContext(Ctx);

export function OutboxProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => setItems((await store.all()).sort((a, b) => a.createdAt - b.createdAt)), []);

  const flush = useCallback(async () => {
    if (busy.current || !tokenStore.get()) return;
    busy.current = true;
    setSyncing(true);
    let sent = 0;
    try {
      for (const item of await store.all()) {
        try {
          await api("/expenses", { body: item.body });
          await store.del(item.uuid);
          sent++;
        } catch (e) {
          // Sem sinal ou sessão expirada: tenta de novo depois, sem perder nada.
          if (isNetworkError(e) || (e as ApiError).status === 401) break;
          await store.put({ ...item, error: (e as Error).message });
        }
      }
    } finally {
      busy.current = false;
      setSyncing(false);
      await refresh();
      if (sent) notifyExpensesChanged();
    }
  }, [refresh]);

  useEffect(() => {
    refresh().then(flush);
    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    const t = setInterval(() => navigator.onLine && flush(), 45000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(t);
    };
  }, [flush, refresh]);

  const send = async (body: Record<string, unknown>) => {
    const uuid = (body.client_uuid as string) || newUuid();
    const full = { ...body, client_uuid: uuid };
    try {
      await api("/expenses", { body: full });
      notifyExpensesChanged();
      return "sent" as const;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      await store.put({ uuid, body: full, createdAt: Date.now() });
      await refresh();
      return "queued" as const;
    }
  };

  const discard = async (uuid: string) => {
    await store.del(uuid);
    await refresh();
  };

  return <Ctx.Provider value={{ items, syncing, send, flush, discard }}>{children}</Ctx.Provider>;
}
