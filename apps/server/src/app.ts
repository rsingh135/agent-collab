import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { ZodError } from "zod";
import { createDb } from "./db/client.js";
import { createServices } from "./services/index.js";
import { HttpError } from "./services/errors.js";
import { registerRoomRoutes } from "./routes/rooms.js";
import { registerGateway } from "./ws/gateway.js";
import { Hub } from "./ws/hub.js";

export interface AppOptions {
  databaseUrl: string;
  publicServerUrl: string;
  boardOrigin: string;
  logLevel?: string;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { db, pool } = createDb(opts.databaseUrl);
  const services = createServices(db, opts.publicServerUrl);
  const hub = new Hub();

  const app = Fastify({ logger: { level: opts.logLevel ?? "info" } });
  await app.register(cors, { origin: [opts.boardOrigin], methods: ["GET", "POST", "OPTIONS"] });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, code: err.code });
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return reply
        .code(400)
        .send({ error: first ? `${first.path.join(".") || "body"}: ${first.message}` : "invalid input", code: "bad_request" });
    }
    const fastifyStatus = (err as { statusCode?: number }).statusCode;
    if (fastifyStatus) {
      return reply.code(fastifyStatus).send({ error: (err as Error).message, code: "bad_request" });
    }
    app.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: "internal error", code: "internal" });
  });

  app.get("/health", async () => ({ ok: true }));
  registerRoomRoutes(app, services, hub);
  registerGateway(app, services, hub);

  // Any session still marked connected is stale after a restart.
  await services.sessions.closeAll();

  app.addHook("onClose", async () => {
    await pool.end();
  });
  return app;
}
