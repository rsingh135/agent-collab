import { and, desc, eq, inArray } from "drizzle-orm";
import {
  buildAgentJoinUrl,
  type CreateRoomBody,
  type JoinRoomBody,
  type MemberCredentials,
  type RoomSnapshot,
} from "@agent-gc/protocol";
import type { Db } from "../db/client.js";
import { agentSessions, members, messages, rooms } from "../db/schema.js";
import { hashSecret, newId, newInviteCode, newToken } from "../ids.js";
import { badRequest, conflict, notFound, unauthorized } from "./errors.js";
import { toMember, toMessage, toRoom, toSession } from "./mappers.js";

export class RoomService {
  constructor(
    private readonly db: Db,
    private readonly publicServerUrl: string,
  ) {}

  async create(body: CreateRoomBody): Promise<MemberCredentials> {
    const inviteCode = newInviteCode();
    const roomId = newId("room");
    const [room] = await this.db
      .insert(rooms)
      .values({
        id: roomId,
        name: body.name,
        idea: body.idea ?? null,
        demoDeadline: body.demoDeadline ? new Date(body.demoDeadline) : null,
        inviteCodeHash: hashSecret(inviteCode),
      })
      .returning();
    if (!room) throw new Error("insert failed");
    return this.addMember(room, body.creatorName, inviteCode);
  }

  async join(roomId: string, body: JoinRoomBody): Promise<MemberCredentials> {
    const [room] = await this.db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (!room) throw notFound("room");
    if (room.inviteCodeHash !== hashSecret(body.inviteCode)) throw unauthorized("wrong invite code");
    return this.addMember(room, body.name, body.inviteCode);
  }

  private async addMember(
    room: typeof rooms.$inferSelect,
    name: string,
    inviteCode: string,
  ): Promise<MemberCredentials> {
    const nameKey = name.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{0,39}$/.test(nameKey)) {
      throw badRequest(
        "bad_name",
        "Name must be 1-40 characters: letters, digits, dot, dash, underscore, no spaces (it is used for @mentions)",
      );
    }
    const humanToken = newToken("hum");
    const agentToken = newToken("agt");
    let member: typeof members.$inferSelect | undefined;
    try {
      [member] = await this.db
        .insert(members)
        .values({
          id: newId("mem"),
          roomId: room.id,
          name: name.trim(),
          nameKey,
          humanTokenHash: hashSecret(humanToken),
          agentTokenHash: hashSecret(agentToken),
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict("name_taken", `"${name}" is already in this room`);
      throw err;
    }
    if (!member) throw new Error("insert failed");
    return {
      room: toRoom(room),
      member: toMember(member),
      humanToken,
      agentJoinUrl: buildAgentJoinUrl({ server: this.publicServerUrl, roomId: room.id, token: agentToken }),
      inviteCode,
    };
  }

  async snapshot(roomId: string): Promise<RoomSnapshot> {
    const [room] = await this.db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (!room) throw notFound("room");
    const memberRows = await this.db.select().from(members).where(eq(members.roomId, roomId));
    const memberIds = memberRows.map((m) => m.id);
    const sessionRows = memberIds.length
      ? await this.db
          .select()
          .from(agentSessions)
          .where(inArray(agentSessions.memberId, memberIds))
          .orderBy(desc(agentSessions.lastSeenAt))
      : [];
    const recent = await this.db
      .select()
      .from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(desc(messages.createdAt))
      .limit(100);
    return {
      room: toRoom(room),
      members: memberRows.map(toMember),
      sessions: sessionRows.map(toSession),
      recentMessages: recent.reverse().map(toMessage),
    };
  }

  async roomMembers(roomId: string) {
    return this.db.select().from(members).where(eq(members.roomId, roomId));
  }

  async memberInRoom(roomId: string, memberId: string) {
    const [m] = await this.db
      .select()
      .from(members)
      .where(and(eq(members.roomId, roomId), eq(members.id, memberId)))
      .limit(1);
    return m;
  }
}

function isUniqueViolation(err: unknown): boolean {
  // Drizzle wraps driver errors; the Postgres code lives on the cause chain.
  for (let e: unknown = err, depth = 0; e && depth < 5; depth++) {
    if (typeof e === "object" && (e as { code?: string }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
