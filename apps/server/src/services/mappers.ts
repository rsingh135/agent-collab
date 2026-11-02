import type { AgentSession, Member, Message, Room } from "@agent-gc/protocol";
import type { agentSessions, members, messages, rooms } from "../db/schema.js";

type RoomRow = typeof rooms.$inferSelect;
type MemberRow = typeof members.$inferSelect;
type SessionRow = typeof agentSessions.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

export function toRoom(r: RoomRow): Room {
  return {
    id: r.id,
    name: r.name,
    idea: r.idea,
    demoDeadline: r.demoDeadline ? r.demoDeadline.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toMember(m: MemberRow): Member {
  return {
    id: m.id,
    roomId: m.roomId,
    name: m.name,
    agentLabel: m.agentLabel,
    area: m.area,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toSession(s: SessionRow): AgentSession {
  return {
    id: s.id,
    memberId: s.memberId,
    claudeSessionId: s.claudeSessionId,
    cwd: s.cwd,
    connected: s.connected,
    lastSeenAt: s.lastSeenAt.toISOString(),
    status: s.currentStatus ?? null,
  };
}

export function toMessage(m: MessageRow): Message {
  return {
    id: m.id,
    roomId: m.roomId,
    senderMemberId: m.senderMemberId,
    senderKind: m.senderKind as Message["senderKind"],
    senderSessionId: m.senderSessionId,
    senderName: m.senderName,
    text: m.text,
    to: m.to,
    mentions: m.mentions,
    fyi: m.fyi,
    threadId: m.threadId,
    createdAt: m.createdAt.toISOString(),
  };
}
