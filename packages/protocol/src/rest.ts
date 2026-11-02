import { z } from "zod";
import { Member, Message, Room, RoomSnapshot } from "./entities.js";

export const CreateRoomBody = z.object({
  name: z.string().trim().min(1).max(80),
  idea: z.string().trim().max(500).optional(),
  demoDeadline: z.string().datetime().optional(),
  /** Display name of the creator, who becomes the first member. */
  creatorName: z.string().trim().min(1).max(40),
});
export type CreateRoomBody = z.infer<typeof CreateRoomBody>;

export const JoinRoomBody = z.object({
  inviteCode: z.string().min(6),
  name: z.string().trim().min(1).max(40),
});
export type JoinRoomBody = z.infer<typeof JoinRoomBody>;

/** Returned on create and join: what the browser needs to act as this member. */
export const MemberCredentials = z.object({
  room: Room,
  member: Member,
  humanToken: z.string(),
  /** agentgc://join?... URL to paste into the agent. */
  agentJoinUrl: z.string(),
  /** Invite code to share with teammates (only returned to room creator or members). */
  inviteCode: z.string(),
});
export type MemberCredentials = z.infer<typeof MemberCredentials>;

export const PostChatBody = z.object({
  text: z.string().trim().min(1).max(4000),
});

export const MessagesPage = z.object({
  messages: z.array(Message),
  nextBefore: z.string().nullable(),
});
export type MessagesPage = z.infer<typeof MessagesPage>;

export const SnapshotResponse = RoomSnapshot;

export const ErrorBody = z.object({ error: z.string(), code: z.string().optional() });

/** Parse an agentgc://join URL. Shape: agentgc://join?server=<http origin>&room=<id>&token=<agent token> */
export function parseAgentJoinUrl(raw: string): { server: string; roomId: string; token: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Not a valid URL");
  }
  if (url.protocol !== "agentgc:") throw new Error("URL must start with agentgc://join");
  const server = url.searchParams.get("server");
  const roomId = url.searchParams.get("room");
  const token = url.searchParams.get("token");
  if (!server || !roomId || !token) throw new Error("URL missing server, room, or token");
  return { server: new URL(server).origin, roomId, token };
}

export function buildAgentJoinUrl(args: { server: string; roomId: string; token: string }): string {
  const u = new URL("agentgc://join");
  u.searchParams.set("server", args.server);
  u.searchParams.set("room", args.roomId);
  u.searchParams.set("token", args.token);
  return u.toString();
}
