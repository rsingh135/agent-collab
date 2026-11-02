import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import {
  assignTier,
  extractMentions,
  type Delivery,
  type Message,
  type MessagesPage,
  type SenderKind,
} from "@agent-gc/protocol";
import type { Db } from "../db/client.js";
import { deliveries, members, messages } from "../db/schema.js";
import { newId } from "../ids.js";
import { badRequest, notFound } from "./errors.js";
import { toMessage } from "./mappers.js";

export interface SendInput {
  roomId: string;
  senderKind: SenderKind;
  senderMemberId: string | null;
  senderSessionId: string | null;
  senderName: string;
  text: string;
  /** Member names or ids. */
  to: string[];
  fyi: boolean;
}

export interface SendResult {
  message: Message;
  /** Deliveries created, keyed by recipient member id. */
  deliveries: Map<string, Delivery>;
}

export class MessageService {
  constructor(private readonly db: Db) {}

  async send(input: SendInput): Promise<SendResult> {
    const roomMembers = await this.db.select().from(members).where(eq(members.roomId, input.roomId));
    const byKey = new Map(roomMembers.map((m) => [m.nameKey, m] as const));
    const byId = new Map(roomMembers.map((m) => [m.id, m] as const));

    const to: string[] = [];
    for (const target of input.to) {
      const m = byId.get(target) ?? byKey.get(target.trim().toLowerCase().replace(/^@/, ""));
      if (!m) throw badRequest("unknown_recipient", `No member named "${target}" in this room`);
      if (!to.includes(m.id)) to.push(m.id);
    }
    const mentionNames = extractMentions(input.text);
    const mentionedIds = mentionNames.map((n) => byKey.get(n)?.id).filter((x): x is string => !!x);
    const fyi = input.senderKind === "agent" && input.fyi;

    const [row] = await this.db
      .insert(messages)
      .values({
        id: newId("msg"),
        roomId: input.roomId,
        senderMemberId: input.senderMemberId,
        senderKind: input.senderKind,
        senderSessionId: input.senderSessionId,
        senderName: input.senderName,
        text: input.text,
        to,
        mentions: mentionNames,
        fyi,
      })
      .returning();
    if (!row) throw new Error("insert failed");
    const message = toMessage(row);

    const created = new Map<string, Delivery>();
    const rows: (typeof deliveries.$inferInsert)[] = [];
    for (const m of roomMembers) {
      const tier = assignTier({
        senderKind: input.senderKind,
        senderMemberId: input.senderMemberId,
        to,
        mentionedMemberIds: mentionedIds,
        fyi,
        recipientMemberId: m.id,
      });
      if (!tier) continue;
      const id = newId("dlv");
      rows.push({ id, messageId: message.id, memberId: m.id, tier });
      created.set(m.id, { deliveryId: id, tier, message });
    }
    if (rows.length) await this.db.insert(deliveries).values(rows);
    return { message, deliveries: created };
  }

  async unreadFor(memberId: string): Promise<Delivery[]> {
    const rows = await this.db
      .select({ d: deliveries, m: messages })
      .from(deliveries)
      .innerJoin(messages, eq(messages.id, deliveries.messageId))
      .where(and(eq(deliveries.memberId, memberId), isNull(deliveries.readAt)))
      .orderBy(messages.createdAt)
      .limit(200);
    return rows.map(({ d, m }) => ({ deliveryId: d.id, tier: d.tier as Delivery["tier"], message: toMessage(m) }));
  }

  async ack(memberId: string, deliveryIds: string[]): Promise<void> {
    if (!deliveryIds.length) return;
    await this.db
      .update(deliveries)
      .set({ readAt: new Date() })
      .where(and(eq(deliveries.memberId, memberId), inArray(deliveries.id, deliveryIds), isNull(deliveries.readAt)));
  }

  async page(roomId: string, before: string | undefined, limit: number): Promise<MessagesPage> {
    const conds = [eq(messages.roomId, roomId)];
    if (before) {
      const [anchor] = await this.db.select().from(messages).where(eq(messages.id, before)).limit(1);
      if (anchor) conds.push(lt(messages.createdAt, anchor.createdAt));
    }
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(...conds))
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit).reverse();
    return { messages: slice.map(toMessage), nextBefore: hasMore && slice[0] ? slice[0].id : null };
  }

  async get(roomId: string, messageId: string): Promise<Message> {
    const [row] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.roomId, roomId), eq(messages.id, messageId)))
      .limit(1);
    if (!row) throw notFound("message");
    return toMessage(row);
  }
}
