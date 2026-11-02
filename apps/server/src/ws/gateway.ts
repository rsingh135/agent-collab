import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { ClientFrame, type ServerFrame } from "@agent-gc/protocol";
import type { Services } from "../services/index.js";
import { HttpError } from "../services/errors.js";
import { send, type Conn, type Hub } from "./hub.js";

export function registerGateway(app: FastifyInstance, services: Services, hub: Hub): void {
  app.get("/ws", { websocket: true }, async (socket, req) => {
    const token = (req.query as { token?: string }).token;
    let conn: Conn;
    try {
      conn = await openConnection(socket, token, services, hub);
    } catch (err) {
      const message = err instanceof HttpError ? err.message : "connection failed";
      send(socket, { type: "error", code: "unauthorized", message });
      socket.close(4001, message);
      return;
    }

    socket.on("message", (raw: Buffer | string) => {
      void handleFrame(conn, raw.toString(), services, hub).catch((err) => {
        app.log.warn({ err }, "ws frame failed");
        send(socket, { type: "error", code: "internal", message: "internal error" });
      });
    });

    socket.on("close", () => {
      hub.remove(conn);
      if (conn.sessionId) {
        void services.sessions
          .close(conn.sessionId)
          .then((session) => {
            if (session) hub.broadcast(conn.roomId, { type: "presence", session });
          })
          .catch((err) => app.log.warn({ err }, "session close failed"));
      }
    });
  });
}

async function openConnection(
  socket: WebSocket,
  token: string | undefined,
  services: Services,
  hub: Hub,
): Promise<Conn> {
  const principal = await services.auth(token);
  const roomId = principal.member.roomId;
  const conn: Conn = {
    kind: principal.kind === "agent" ? "agent" : "board",
    roomId,
    memberId: principal.member.id,
    sessionId: null,
    socket,
  };
  if (conn.kind === "agent") {
    const session = await services.sessions.open(principal.member.id);
    conn.sessionId = session.id;
    hub.add(conn);
    hub.broadcast(roomId, { type: "presence", session });
  } else {
    hub.add(conn);
  }
  const snapshot = await services.rooms.snapshot(roomId);
  send(socket, {
    type: "snapshot",
    self: { memberId: principal.member.id, sessionId: conn.sessionId },
    snapshot,
  });
  if (conn.kind === "agent") {
    const deliveries = await services.messages.unreadFor(principal.member.id);
    send(socket, { type: "inbox", deliveries });
  }
  return conn;
}

async function handleFrame(conn: Conn, raw: string, services: Services, hub: Hub): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    send(conn.socket, { type: "error", code: "bad_json", message: "frame is not JSON" });
    return;
  }
  const result = ClientFrame.safeParse(parsed);
  if (!result.success) {
    send(conn.socket, { type: "error", code: "bad_frame", message: result.error.issues[0]?.message ?? "invalid frame" });
    return;
  }
  const frame = result.data;
  switch (frame.type) {
    case "send_message": {
      const member = await services.rooms.memberInRoom(conn.roomId, conn.memberId);
      if (!member) return;
      const isAgent = conn.kind === "agent";
      let result;
      try {
        result = await services.messages.send({
          roomId: conn.roomId,
          senderKind: isAgent ? "agent" : "human",
          senderMemberId: member.id,
          senderSessionId: conn.sessionId,
          senderName: isAgent ? `${member.name}/agent` : member.name,
          text: frame.text,
          to: frame.to,
          fyi: isAgent && frame.fyi,
        });
      } catch (err) {
        if (err instanceof HttpError) {
          const e: ServerFrame = { type: "error", code: err.code, message: err.message };
          if (frame.clientId !== undefined) e.clientId = frame.clientId;
          send(conn.socket, e);
          return;
        }
        throw err;
      }
      hub.broadcast(conn.roomId, { type: "message", message: result.message }, { kind: "board" });
      for (const [memberId, delivery] of result.deliveries) {
        hub.toMemberAgents(conn.roomId, memberId, { type: "delivery", delivery });
      }
      const sent: ServerFrame = { type: "sent", messageId: result.message.id };
      if (frame.clientId !== undefined) sent.clientId = frame.clientId;
      send(conn.socket, sent);
      return;
    }
    case "status_event": {
      if (!conn.sessionId) return;
      const session = await services.sessions.setStatus(conn.sessionId, frame.status);
      hub.broadcast(conn.roomId, { type: "presence", session });
      return;
    }
    case "session_register": {
      if (!conn.sessionId) return;
      const session = await services.sessions.register(conn.sessionId, frame.claudeSessionId, frame.cwd);
      hub.broadcast(conn.roomId, { type: "presence", session });
      return;
    }
    case "ack": {
      if (conn.kind !== "agent") return;
      await services.messages.ack(conn.memberId, frame.deliveryIds);
      return;
    }
    case "fetch_inbox": {
      if (conn.kind !== "agent") return;
      const deliveries = await services.messages.unreadFor(conn.memberId);
      send(conn.socket, { type: "inbox", deliveries });
      return;
    }
  }
}
