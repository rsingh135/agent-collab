import { buildApp } from "./app.js";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";

async function main() {
  await runMigrations(config.databaseUrl);
  const app = await buildApp({
    databaseUrl: config.databaseUrl,
    publicServerUrl: config.publicServerUrl,
    boardOrigin: config.boardOrigin,
    logLevel: config.logLevel,
  });
  await app.listen({ port: config.port, host: config.host });
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
