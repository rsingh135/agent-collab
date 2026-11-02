import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CreateRoomBody, JoinRoomBody } from "@agent-gc/protocol";
import type { Services } from "../services/index.js";
import { bearer } from "../services/auth.js";
import { HttpError } from "../services/errors.js";
import type { Hub } from "../ws/hub.js";

const RoomParams = z.object({ roomId: z.string() });
const PageQuery = z.object({ before: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });
const MessageParams = z.object({ roomId: z.string(), messageId: z.string() });

export function registerRoomRoutes(app: FastifyInstance, services: Services, hub: Hub): void {
  app.post("/rooms", async (req, reply) => {
    const body = CreateRoomBody.parse(req.body);
    const creds = await services.rooms.create(body);
    return reply.code(201).send(creds);
  });

  app.post("/rooms/:roomId/join", async (req, reply) => {
    const { roomId } = RoomParams.parse(req.params);
    const body = JoinRoomBody.parse(req.body);
    const creds = await services.rooms.join(roomId, body);
    hub.broadcast(roomId, { type: "member_joined", member: creds.member });
    return reply.code(201).send(creds);
  });

  app.get("/rooms/:roomId", async (req) => {
    const { roomId } = RoomParams.parse(req.params);
    await requireRoomMember(services, req.headers.authorization, roomId);
    return services.rooms.snapshot(roomId);
  });

  app.get("/rooms/:roomId/messages", async (req) => {
    const { roomId } = RoomParams.parse(req.params);
    const q = PageQuery.parse(req.query);
    await requireRoomMember(services, req.headers.authorization, roomId);
    return services.messages.page(roomId, q.before, q.limit);
  });

  app.get("/rooms/:roomId/messages/:messageId", async (req) => {
    const { roomId, messageId } = MessageParams.parse(req.params);
    await requireRoomMember(services, req.headers.authorization, roomId);
    return services.messages.get(roomId, messageId);
  });
}

async function requireRoomMember(services: Services, authHeader: string | undefined, roomId: string) {
  const principal = await services.auth(bearer(authHeader));
  if (principal.member.roomId !== roomId) throw new HttpError(403, "forbidden", "token is for a different room");
  return principal;
}
