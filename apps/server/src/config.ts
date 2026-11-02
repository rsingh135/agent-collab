export const config = {
  port: Number(process.env.PORT ?? 4100),
  host: process.env.HOST ?? "127.0.0.1",
  databaseUrl: process.env.DATABASE_URL ?? "postgres://agentgc:agentgc@localhost:5434/agentgc",
  /** Origin agents should use to reach this server; embedded in agent join URLs. */
  publicServerUrl: process.env.PUBLIC_SERVER_URL ?? `http://localhost:${process.env.PORT ?? 4100}`,
  /** Allowed browser origin for CORS. */
  boardOrigin: process.env.BOARD_ORIGIN ?? "http://localhost:3100",
  logLevel: process.env.LOG_LEVEL ?? "info",
};
