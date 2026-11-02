import {
  fenceDeliveries,
  parseAgentJoinUrl,
  type AgentStatus,
  type Delivery,
  type Message,
  type Tier,
} from "@agent-gc/protocol";
import { CredentialStore, Inbox, RoomClient, type RoomCreds } from "@agent-gc/local";

export interface RuntimeEvents {
  /** An urgent delivery arrived while connected; used for optional channel push. */
  onUrgent?: (d: Delivery) => void;
  log: (msg: string) => void;
}

/**
 * Per-Claude-session state: the room connection, the local inbox, and session identity.
 * This is the "local daemon" role from the spec, hosted inside the MCP server process.
 */
export class AgentRuntime {
  readonly inbox = new Inbox();
  readonly creds = new CredentialStore();
  client: RoomClient | null = null;
  roomCreds: RoomCreds | null = null;
  claudeSessionId: string | null = null;
  cwd: string;
  private lastStatus: AgentStatus | null = null;

  constructor(
    cwd: string,
    private readonly events: RuntimeEvents,
  ) {
    this.cwd = cwd;
  }

  get joined(): boolean {
    return this.client !== null;
  }

  get memberName(): string | null {
    const id = this.client?.self?.memberId;
    return this.client?.snapshot?.members.find((m) => m.id === id)?.name ?? null;
  }

  get roomName(): string | null {
    return this.client?.snapshot?.room.name ?? null;
  }

  /** Connect using credentials previously saved for this cwd, if any. */
  autoJoin(): boolean {
    const creds = this.creds.forCwd(this.cwd);
    if (!creds) return false;
    this.connect(creds);
    return true;
  }

  async join(url: string): Promise<{ roomName: string; memberName: string }> {
    const parsed = parseAgentJoinUrl(url);
    const creds = this.creds.save({ server: parsed.server, roomId: parsed.roomId, token: parsed.token }, this.cwd);
    this.connect(creds);
    const client = this.client!;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out connecting to the room server")), 10_000);
      client.once("snapshot", () => {
        clearTimeout(timer);
        resolve();
      });
      client.once("close", (code, reason) => {
        if (code === 4001) {
          clearTimeout(timer);
          this.creds.remove(parsed.roomId);
          this.client = null;
          reject(new Error(`room server rejected the token: ${reason || "unauthorized"}`));
        }
      });
    });
    return { roomName: this.roomName ?? "?", memberName: this.memberName ?? "?" };
  }

  leave(): void {
    if (this.roomCreds) this.creds.remove(this.roomCreds.roomId);
    this.client?.close();
    this.client = null;
    this.roomCreds = null;
  }

  private connect(creds: RoomCreds): void {
    this.client?.close();
    this.roomCreds = creds;
    const client = new RoomClient({ server: creds.server, token: creds.token, log: this.events.log });
    client.on("snapshot", () => {
      client.register(this.claudeSessionId, this.cwd);
      if (this.lastStatus) client.status(this.lastStatus);
    });
    client.on("delivery", (d) => {
      if (this.inbox.add(d) && d.tier === "urgent") this.events.onUrgent?.(d);
    });
    client.on("inbox", (ds) => {
      const added = this.inbox.addAll(ds);
      if (added) this.events.log(`${added} pending message(s) from the room`);
    });
    client.on("error", (err) => this.events.log(`ws error: ${err.message}`));
    client.connect();
    this.client = client;
  }

  setSession(claudeSessionId: string, cwd: string): void {
    this.claudeSessionId = claudeSessionId;
    this.cwd = cwd;
    if (this.client) {
      this.client.register(claudeSessionId, cwd);
      if (!this.roomCreds) return;
      // Record this cwd against the room so later sessions here auto-join.
      this.creds.save(
        { server: this.roomCreds.server, roomId: this.roomCreds.roomId, token: this.roomCreds.token },
        cwd,
      );
    } else {
      this.autoJoin();
    }
  }

  status(status: AgentStatus): void {
    this.lastStatus = { ...status, note: status.note ?? this.lastStatus?.note ?? null };
    this.client?.status(this.lastStatus);
  }

  setNote(note: string | null): void {
    const base = this.lastStatus ?? { state: "working" as const, action: null, file: null, note: null, at: "" };
    this.status({ ...base, note, at: new Date().toISOString() });
  }

  /** Remove pending deliveries, ack them, return fenced text. */
  drain(tiers?: Tier[], limit?: number): { text: string; count: number } {
    let items: Delivery[];
    if (!tiers) items = this.inbox.drain(limit ? { limit } : {});
    else {
      items = [];
      for (const t of tiers) items.push(...this.inbox.drain(limit ? { tier: t, limit } : { tier: t }));
    }
    if (items.length) this.client?.ack(items.map((d) => d.deliveryId));
    return { text: fenceDeliveries(items), count: items.length };
  }

  async send(text: string, to: string[], fyi: boolean): Promise<string> {
    if (!this.client) throw new Error("Not in a room. Ask your human for the agentgc://join URL and call join_room.");
    return this.client.send(text, { to, fyi });
  }

  async fetchMessage(id: string): Promise<Message> {
    if (!this.roomCreds) throw new Error("Not in a room.");
    const r = await fetch(`${this.roomCreds.server}/rooms/${this.roomCreds.roomId}/messages/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${this.roomCreds.token}` },
    });
    if (!r.ok) throw new Error(`message ${id} not found (${r.status})`);
    return (await r.json()) as Message;
  }
}
