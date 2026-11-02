import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDb } from "./client.js";
import { config } from "../config.js";

export async function runMigrations(databaseUrl = config.databaseUrl): Promise<void> {
  const { db, pool } = createDb(databaseUrl);
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/db -> ../../drizzle ; src/db -> ../../drizzle
  const migrationsFolder = path.resolve(here, "../../drizzle");
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => {
      console.log("migrations applied");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
