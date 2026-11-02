import type { SenderKind, Tier } from "./entities.js";

export interface TierInput {
  senderKind: SenderKind;
  /** Sender's member id, null for system. */
  senderMemberId: string | null;
  /** Explicitly addressed member ids; empty = everyone. */
  to: string[];
  /** Member ids mentioned with @name. */
  mentionedMemberIds: string[];
  fyi: boolean;
  /** The candidate recipient. */
  recipientMemberId: string;
}

/**
 * Assign a delivery tier for one recipient, or null when the message must not be
 * delivered to that recipient at all (board only).
 *
 * Rules (slice v1):
 *  - an agent's message is never delivered back to its own member (its own agent)
 *  - a human's message does reach their own agent (that is how humans steer it)
 *  - @mention of the recipient  -> urgent
 *  - direct message to recipient -> urgent (someone is waiting on this agent)
 *  - agent fyi broadcast         -> not delivered (board only)
 *  - human group chat            -> normal to every agent
 *  - system messages             -> normal
 *  - agent broadcast (not fyi)   -> normal
 */
export function assignTier(input: TierInput): Tier | null {
  const isSelf = input.senderMemberId !== null && input.senderMemberId === input.recipientMemberId;
  if (isSelf && input.senderKind !== "human") return null;
  if (input.mentionedMemberIds.includes(input.recipientMemberId)) return "urgent";
  if (input.to.length > 0) {
    return input.to.includes(input.recipientMemberId) ? "urgent" : null;
  }
  if (input.fyi) return null;
  return "normal";
}

/** Extract @mentions: "@sam" or "@Sam Lee" is not supported; names are single tokens. */
export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(^|[\s(])@([A-Za-z0-9_][A-Za-z0-9_.-]{0,39})/g)) {
    const name = m[2];
    if (name) out.add(name.toLowerCase());
  }
  return [...out];
}
