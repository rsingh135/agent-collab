import { z } from "zod";
import { AgentSession, AgentStatus, Delivery, Member, Message, RoomSnapshot } from "./entities.js";

// ---------- client -> server ----------

export const SendMessageFrame = z.object({
  type: z.literal("send_message"),
  /** Client-generated id for ack correlation. */
  clientId: z.string().optional(),
  text: z.string().trim().min(1).max(4000),
  /** Member names or ids. Empty / omitted = everyone in the room. */
  to: z.array(z.string()).default([]),
  /** Agent-only: informational broadcast, board only. */
  fyi: z.boolean().default(false),
});

export const StatusEventFrame = z.object({
  type: z.literal("status_event"),
  status: AgentStatus,
});

export const SessionRegisterFrame = z.object({
  type: z.literal("session_register"),
  claudeSessionId: z.string().nullable(),
  cwd: z.string().nullable(),
});

export const AckFrame = z.object({
  type: z.literal("ack"),
  deliveryIds: z.array(z.string()).min(1),
});

export const FetchInboxFrame = z.object({
  type: z.literal("fetch_inbox"),
});

export const ClientFrame = z.discriminatedUnion("type", [
  SendMessageFrame,
  StatusEventFrame,
  SessionRegisterFrame,
  AckFrame,
  FetchInboxFrame,
]);
export type ClientFrame = z.infer<typeof ClientFrame>;

// ---------- server -> client ----------

export const SnapshotFrame = z.object({
  type: z.literal("snapshot"),
  self: z.object({ memberId: z.string(), sessionId: z.string().nullable() }),
  snapshot: RoomSnapshot,
});

/** Board-facing: every message in the room, with no tier (board shows all). */
export const MessageFrame = z.object({
  type: z.literal("message"),
  message: Message,
});

/** Agent-facing: a message addressed to this session, with its tier. */
export const DeliveryFrame = z.object({
  type: z.literal("delivery"),
  delivery: Delivery,
});

export const InboxFrame = z.object({
  type: z.literal("inbox"),
  deliveries: z.array(Delivery),
});

export const PresenceFrame = z.object({
  type: z.literal("presence"),
  session: AgentSession,
});

export const MemberJoinedFrame = z.object({
  type: z.literal("member_joined"),
  member: Member,
});

export const SentFrame = z.object({
  type: z.literal("sent"),
  clientId: z.string().optional(),
  messageId: z.string(),
});

export const ErrorFrame = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
  clientId: z.string().optional(),
});

export const ServerFrame = z.discriminatedUnion("type", [
  SnapshotFrame,
  MessageFrame,
  DeliveryFrame,
  InboxFrame,
  PresenceFrame,
  MemberJoinedFrame,
  SentFrame,
  ErrorFrame,
]);
export type ServerFrame = z.infer<typeof ServerFrame>;
