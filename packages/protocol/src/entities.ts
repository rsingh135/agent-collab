import { z } from "zod";

export const AgentState = z.enum(["working", "waiting_on_human", "idle", "offline"]);
export type AgentState = z.infer<typeof AgentState>;

export const Tier = z.enum(["urgent", "normal", "fyi"]);
export type Tier = z.infer<typeof Tier>;

export const SenderKind = z.enum(["human", "agent", "system"]);
export type SenderKind = z.infer<typeof SenderKind>;

/** Agent status as shown on the board activity line. */
export const AgentStatus = z.object({
  state: AgentState,
  /** Short human-readable action, e.g. "editing web/Timer.tsx". */
  action: z.string().max(200).nullable(),
  /** File path relative to cwd when the action concerns a file. */
  file: z.string().max(500).nullable(),
  /** Agent-declared note of what it is working on (set_note). */
  note: z.string().max(200).nullable(),
  /** ISO timestamp of the event that produced this status. */
  at: z.string().datetime(),
});
export type AgentStatus = z.infer<typeof AgentStatus>;

export const Room = z.object({
  id: z.string(),
  name: z.string(),
  idea: z.string().nullable(),
  demoDeadline: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Room = z.infer<typeof Room>;

export const Member = z.object({
  id: z.string(),
  roomId: z.string(),
  name: z.string(),
  agentLabel: z.string().nullable(),
  area: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Member = z.infer<typeof Member>;

export const AgentSession = z.object({
  id: z.string(),
  memberId: z.string(),
  claudeSessionId: z.string().nullable(),
  cwd: z.string().nullable(),
  connected: z.boolean(),
  lastSeenAt: z.string().datetime(),
  status: AgentStatus.nullable(),
});
export type AgentSession = z.infer<typeof AgentSession>;

export const Message = z.object({
  id: z.string(),
  roomId: z.string(),
  senderMemberId: z.string().nullable(),
  senderKind: SenderKind,
  senderSessionId: z.string().nullable(),
  /** Display name resolved server-side: "Sam" or "Sam/agent". */
  senderName: z.string(),
  text: z.string(),
  /** Member ids explicitly addressed, empty = everyone. */
  to: z.array(z.string()),
  /** Member names mentioned with @. */
  mentions: z.array(z.string()),
  /** FYI broadcast from an agent: board only, never delivered. */
  fyi: z.boolean(),
  threadId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Message = z.infer<typeof Message>;

/** A message plus the tier it was assigned for one specific recipient session. */
export const Delivery = z.object({
  deliveryId: z.string(),
  tier: Tier,
  message: Message,
});
export type Delivery = z.infer<typeof Delivery>;

export const RoomSnapshot = z.object({
  room: Room,
  members: z.array(Member),
  sessions: z.array(AgentSession),
  recentMessages: z.array(Message),
});
export type RoomSnapshot = z.infer<typeof RoomSnapshot>;
