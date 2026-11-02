import { z } from "zod";
import { AgentStatus, Tier } from "@agent-gc/protocol";

/** Requests from the hook script to the MCP process over the local unix socket. */
export const LocalRequest = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session_start"), sessionId: z.string(), cwd: z.string() }),
  z.object({ type: z.literal("status"), status: AgentStatus }),
  z.object({
    type: z.literal("drain"),
    tiers: z.array(Tier).optional(),
  }),
  z.object({ type: z.literal("peek") }),
  z.object({ type: z.literal("session_end") }),
]);
export type LocalRequest = z.infer<typeof LocalRequest>;

export interface SessionStartResult {
  joined: boolean;
  roomName: string | null;
  memberName: string | null;
  pending: number;
}

export interface DrainResult {
  /** Fenced text ready for injection, empty when nothing pending. */
  text: string;
  count: number;
}

export interface PeekResult {
  joined: boolean;
  urgent: number;
  normal: number;
}
