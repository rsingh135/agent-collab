import type { Delivery, Tier } from "@agent-gc/protocol";

/** Local queue of deliveries awaiting consumption by the agent. Deduped by delivery id. */
export class Inbox {
  private items = new Map<string, Delivery>();
  private waiters: Array<() => void> = [];

  add(d: Delivery): boolean {
    if (this.items.has(d.deliveryId)) return false;
    this.items.set(d.deliveryId, d);
    for (const w of this.waiters.splice(0)) w();
    return true;
  }

  addAll(ds: Delivery[]): number {
    let n = 0;
    for (const d of ds) if (this.add(d)) n++;
    return n;
  }

  get size(): number {
    return this.items.size;
  }

  count(tier?: Tier): number {
    if (!tier) return this.items.size;
    let n = 0;
    for (const d of this.items.values()) if (d.tier === tier) n++;
    return n;
  }

  peek(): Delivery[] {
    return [...this.items.values()];
  }

  /** Remove and return pending deliveries, optionally only a tier, optionally capped. */
  drain(opts: { tier?: Tier; limit?: number } = {}): Delivery[] {
    const out: Delivery[] = [];
    for (const [id, d] of this.items) {
      if (opts.tier && d.tier !== opts.tier) continue;
      out.push(d);
      this.items.delete(id);
      if (opts.limit && out.length >= opts.limit) break;
    }
    return out;
  }

  /** Resolve when at least one item is present or the timeout passes. */
  waitForAny(timeoutMs: number): Promise<boolean> {
    if (this.items.size > 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== wake);
        resolve(false);
      }, timeoutMs);
      const wake = () => {
        clearTimeout(timer);
        resolve(true);
      };
      this.waiters.push(wake);
    });
  }
}
