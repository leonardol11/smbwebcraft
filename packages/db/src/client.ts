import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { env } from "@outreach/env";
import * as schema from "./schema";
import { resolvePglitePath } from "./pglite-path";

/**
 * Unified database handle. PGlite's drizzle instance is API-compatible with
 * the node-postgres one for everything we use, so we present a single type.
 */
export type Db = NodePgDatabase<typeof schema>;

type GlobalWithDb = typeof globalThis & { __outreachDb?: Promise<Db> };

async function createDb(): Promise<Db> {
  const url = env().DATABASE_URL;
  if (url.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const path = resolvePglitePath(url.slice("pglite://".length));
    const pglite = path === "memory" ? new PGlite() : new PGlite(path);
    return drizzle(pglite, { schema }) as unknown as Db;
  }
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: url });
  return drizzle(pool, { schema });
}

/** Singleton database handle (survives Next.js hot reload). */
export function getDb(): Promise<Db> {
  const g = globalThis as GlobalWithDb;
  if (!g.__outreachDb) g.__outreachDb = createDb();
  return g.__outreachDb;
}

/** Test helper: replace the singleton (e.g. with an in-memory PGlite db). */
export function setDbForTests(db: Db): void {
  (globalThis as GlobalWithDb).__outreachDb = Promise.resolve(db);
}
