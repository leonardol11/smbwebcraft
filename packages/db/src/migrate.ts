import { fileURLToPath } from "node:url";
import path from "node:path";
import { env } from "@outreach/env";
import * as schema from "./schema";
import { resolvePglitePath } from "./pglite-path";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

export async function runMigrations(): Promise<void> {
  const url = env().DATABASE_URL;
  if (url.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const p = resolvePglitePath(url.slice("pglite://".length));
    const client = p === "memory" ? new PGlite() : new PGlite(p);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    await client.close();
  } else {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
    await pool.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runMigrations()
    .then(() => {
      console.log("Migrations applied.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
