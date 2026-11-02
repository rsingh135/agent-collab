import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { AgentStatus } from "@agent-gc/protocol";

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  idea: text("idea"),
  demoDeadline: timestamp("demo_deadline", { withTimezone: true, mode: "date" }),
  inviteCodeHash: text("invite_code_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Lowercased name for @mention matching and uniqueness within a room. */
    nameKey: text("name_key").notNull(),
    agentLabel: text("agent_label"),
    area: text("area"),
    humanTokenHash: text("human_token_hash").notNull(),
    agentTokenHash: text("agent_token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("members_room_name_key").on(t.roomId, t.nameKey),
    uniqueIndex("members_human_token_idx").on(t.humanTokenHash),
    uniqueIndex("members_agent_token_idx").on(t.agentTokenHash),
  ],
);

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    claudeSessionId: text("claude_session_id"),
    cwd: text("cwd"),
    connected: boolean("connected").notNull().default(false),
    currentStatus: jsonb("current_status").$type<AgentStatus>(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("agent_sessions_member_idx").on(t.memberId)],
);

export const statusEvents = pgTable(
  "status_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
    action: text("action"),
    file: text("file"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("status_events_session_time_idx").on(t.sessionId, t.createdAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    senderMemberId: text("sender_member_id").references(() => members.id, { onDelete: "set null" }),
    senderKind: text("sender_kind").notNull(),
    senderSessionId: text("sender_session_id"),
    senderName: text("sender_name").notNull(),
    text: text("text").notNull(),
    to: jsonb("to").$type<string[]>().notNull().default([]),
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    fyi: boolean("fyi").notNull().default(false),
    threadId: text("thread_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("messages_room_time_idx").on(t.roomId, t.createdAt)],
);

/** One row per (message, recipient member) that should reach that member's agent. */
export const deliveries = pgTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    tier: text("tier").notNull(),
    /** Set when an agent acknowledged consuming the message. */
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("deliveries_member_unread_idx").on(t.memberId, t.readAt)],
);
