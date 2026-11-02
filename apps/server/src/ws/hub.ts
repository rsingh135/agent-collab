import type { ServerFrame } from "@agent-gc/protocol";
import type { WebSocket } from "ws";

export interface Conn {
  kind: "board" | "agent";
  roomId: string;
  memberId: string;
  /** Agent sessions only. */
  sessionId: string | null;
  socket: WebSocket;
}

/** In-process registry of live connections per room. Single-instance by design (see plan). */
export class Hub {
  private rooms = new Map<string, Set<Conn>>();

  add(conn: Conn): void {
    let set = this.rooms.get(conn.roomId);
    if (!set) {
      set = new Set();
      this.rooms.set(conn.roomId, set);
    }
    set.add(conn);
  }

  remove(conn: Conn): void {
    const set = this.rooms.get(conn.roomId);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) this.rooms.delete(conn.roomId);
  }

  /** Every connection in the room (boards and agents). */
  broadcast(roomId: string, frame: ServerFrame, opts?: { kind?: Conn["kind"] }): void {
    const set = this.rooms.get(roomId);
    if (!set) return;
    const payload = JSON.stringify(frame);
    for (const c of set) {
      if (opts?.kind && c.kind !== opts.kind) continue;
      send(c.socket, payload);
    }
  }

  /** Agent connections belonging to a member. */
  toMemberAgents(roomId: string, memberId: string, frame: ServerFrame): number {
    const set = this.rooms.get(roomId);
    if (!set) return 0;
    const payload = JSON.stringify(frame);
    let n = 0;
    for (const c of set) {
      if (c.kind === "agent" && c.memberId === memberId) {
        send(c.socket, payload);
        n++;
      }
    }
    return n;
  }

  connectionCount(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }
}

export function send(socket: WebSocket, payload: string | ServerFrame): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(typeof payload === "string" ? payload : JSON.stringify(payload));
}
