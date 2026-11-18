import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

/**
 * Banco de dados:
 * - com DATABASE_URL → PostgreSQL (Neon, RDS, local...)
 * - sem DATABASE_URL → PGlite (Postgres embutido) gravando em .data/ — bom para desenvolvimento.
 * As duas opções falam o mesmo SQL, então o resto do código não muda.
 */
export interface Queryable {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
}

// NUMERIC e BIGINT chegam como string; DATE fica como 'YYYY-MM-DD' (sem fuso).
const PARSERS: Record<number, (v: string) => unknown> = {
  1700: (v) => parseFloat(v),
  20: (v) => parseInt(v, 10),
  1082: (v) => v,
};

interface Driver extends Queryable {
  tx<T>(fn: (db: Queryable) => Promise<T>): Promise<T>;
}

async function createDriver(): Promise<Driver> {
  if (process.env.DATABASE_URL) {
    for (const [oid, fn] of Object.entries(PARSERS)) pg.types.setTypeParser(Number(oid), fn);
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    return {
      query: async (text, params = []) => (await pool.query(text, params)).rows,
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const out = await fn({ query: async (t, p = []) => (await client.query(t, p)).rows });
          await client.query("COMMIT");
          return out;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      },
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.data/pglite");
  console.log(`DATABASE_URL não definida — usando banco local em ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir, { parsers: PARSERS });
  // PGlite roda em uma única conexão: serializamos para uma transação não intercalar com outras consultas.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  return {
    query: (text, params = []) => serial(async () => (await db.query<any>(text, params)).rows),
    tx: (fn) => serial(() => db.transaction((t) => fn({ query: async (q, p = []) => (await t.query<any>(q, p)).rows }))),
  };
}

let driver: Promise<Driver> | null = null;
const getDriver = () => (driver ??= createDriver());

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await getDriver()).query<T>(text, params);
}

export async function tx<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  return (await getDriver()).tx(fn);
}

/** Executa vários comandos SQL (schema). */
export async function exec(sql: string) {
  const statements = sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
  for (const s of statements) await query(s);
}
