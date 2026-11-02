import { EventEmitter } from "node:events";
import WebSocket from "ws";
import {
  ServerFrame,
  type AgentStatus,
  type ClientFrame,
  type Delivery,
  type RoomSnapshot,
} from "@agent-gc/protocol";

export interface RoomClientOptions {
  server: string;
  token: string;
  /** Called for log lines; defaults to silent. */
  log?: (msg: string) => void;
  /** Max reconnect delay. */
  maxBackoffMs?: number;
}

export interface RoomClientEvents {
  open: [];
  close: [code: number, reason: string];
  snapshot: [snapshot: RoomSnapshot, self: { memberId: string; sessionId: string | null }];
  delivery: [delivery: Delivery];
  inbox: [deliveries: Delivery[]];
  frame: [frame: ServerFrame];
  error: [err: Error];
}

/**
 * One WebSocket to the room server with automatic reconnect.
 * Outbound frames sent while disconnected are queued and flushed on reconnect.
 */
export class RoomClient extends EventEmitter<RoomClientEvents> {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private backoff = 500;
  private readonly maxBackoff: number;
  private queue: string[] = [];
  private pendingSends = new Map<string, { resolve: (id: string) => void; reject: (e: Error) => void }>();
  private seq = 0;
  private readonly log: (msg: string) => void;
  public snapshot: RoomSnapshot | null = null;
  public self: { memberId: string; sessionId: string | null } | null = null;

  constructor(private readonly opts: RoomClientOptions) {
    super();
    this.log = opts.log ?? (() => {});
    this.maxBackoff = opts.maxBackoffMs ?? 15_000;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    this.closedByUser = false;
    this.dial();
  }

  private dial(): void {
    const url = new URL("/ws", this.opts.server);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("token", this.opts.token);
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.on("open", () => {
      this.backoff = 500;
      this.log("connected");
      for (const f of this.queue.splice(0)) ws.send(f);
      this.emit("open");
    });
    ws.on("message", (raw) => this.onFrame(raw.toString()));
    ws.on("error", (err) => this.emit("error", err));
    ws.on("close", (code, reason) => {
      this.ws = null;
      this.emit("close", code, reason.toString());
      for (const p of this.pendingSends.values()) p.reject(new Error("connection closed"));
      this.pendingSends.clear();
      if (this.closedByUser || code === 4001) return; // 4001 = rejected token, do not retry
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
      this.log(`disconnected (${code}); retry in ${delay}ms`);
      setTimeout(() => !this.closedByUser && this.dial(), delay).unref();
    });
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close(1000, "client closed");
    this.ws = null;
  }

  private onFrame(raw: string): void {
    const parsed = ServerFrame.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      this.log(`bad server frame: ${parsed.error.issues[0]?.message}`);
      return;
    }
    const frame = parsed.data;
    this.emit("frame", frame);
    switch (frame.type) {
      case "snapshot":
        this.snapshot = frame.snapshot;
        this.self = frame.self;
        this.emit("snapshot", frame.snapshot, frame.self);
        break;
      case "delivery":
        this.emit("delivery", frame.delivery);
        break;
      case "inbox":
        this.emit("inbox", frame.deliveries);
        break;
      case "sent":
        if (frame.clientId) this.pendingSends.get(frame.clientId)?.resolve(frame.messageId);
        if (frame.clientId) this.pendingSends.delete(frame.clientId);
        break;
      case "error":
        if (frame.clientId) {
          this.pendingSends.get(frame.clientId)?.reject(new Error(frame.message));
          this.pendingSends.delete(frame.clientId);
        } else {
          this.log(`server error ${frame.code}: ${frame.message}`);
        }
        break;
      case "presence":
        if (this.snapshot) {
          const i = this.snapshot.sessions.findIndex((s) => s.id === frame.session.id);
          if (i >= 0) this.snapshot.sessions[i] = frame.session;
          else this.snapshot.sessions.unshift(frame.session);
        }
        break;
      case "member_joined":
        this.snapshot?.members.push(frame.member);
        break;
      case "message":
        this.snapshot?.recentMessages.push(frame.message);
        break;
    }
  }

  private raw(frame: ClientFrame): void {
    const payload = JSON.stringify(frame);
    if (this.connected && this.ws) this.ws.send(payload);
    else this.queue.push(payload);
  }

  /** Send a message; resolves with the server message id. */
  send(text: string, opts: { to?: string[]; fyi?: boolean } = {}): Promise<string> {
    const clientId = `c${++this.seq}`;
    return new Promise((resolve, reject) => {
      this.pendingSends.set(clientId, { resolve, reject });
      this.raw({ type: "send_message", clientId, text, to: opts.to ?? [], fyi: opts.fyi ?? false });
      setTimeout(() => {
        if (this.pendingSends.delete(clientId)) reject(new Error("send timed out"));
      }, 10_000).unref();
    });
  }

  status(status: AgentStatus): void {
    this.raw({ type: "status_event", status });
  }

  register(claudeSessionId: string | null, cwd: string | null): void {
    this.raw({ type: "session_register", claudeSessionId, cwd });
  }

  ack(deliveryIds: string[]): void {
    if (deliveryIds.length) this.raw({ type: "ack", deliveryIds });
  }

  fetchInbox(): void {
    this.raw({ type: "fetch_inbox" });
  }
}
