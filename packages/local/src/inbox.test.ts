import { describe, expect, it } from "vitest";
import { Inbox } from "./inbox.js";
import type { Delivery } from "@agent-gc/protocol";

const mk = (id: string, tier: Delivery["tier"] = "normal"): Delivery => ({
  deliveryId: id,
  tier,
  message: {
    id: "m" + id, roomId: "r", senderMemberId: "x", senderKind: "agent", senderSessionId: null,
    senderName: "x/agent", text: "t", to: [], mentions: [], fyi: false, threadId: null,
    createdAt: new Date().toISOString(),
  },
});

describe("Inbox", () => {
  it("dedupes and drains by tier", () => {
    const box = new Inbox();
    expect(box.add(mk("1"))).toBe(true);
    expect(box.add(mk("1"))).toBe(false);
    box.add(mk("2", "urgent"));
    expect(box.count("urgent")).toBe(1);
    expect(box.drain({ tier: "urgent" }).map((d) => d.deliveryId)).toEqual(["2"]);
    expect(box.size).toBe(1);
  });
  it("waitForAny wakes on add and times out otherwise", async () => {
    const box = new Inbox();
    const p = box.waitForAny(500);
    setTimeout(() => box.add(mk("1")), 10);
    expect(await p).toBe(true);
    expect(await new Inbox().waitForAny(20)).toBe(false);
  });
});
