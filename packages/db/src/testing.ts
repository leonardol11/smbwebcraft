import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Db } from "./client";
import * as schema from "./schema";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

/**
 * Creates a fresh in-memory PGlite database with all migrations applied.
 * Used by unit/integration tests so they run offline with zero setup.
 */
export async function createTestDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}
