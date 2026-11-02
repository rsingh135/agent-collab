import { eq } from "drizzle-orm";
import type { AgentSession, AgentStatus } from "@agent-gc/protocol";
import type { Db } from "../db/client.js";
import { agentSessions, statusEvents } from "../db/schema.js";
import { newId } from "../ids.js";
import { toSession } from "./mappers.js";

export class SessionService {
  constructor(private readonly db: Db) {}

  async open(memberId: string): Promise<AgentSession> {
    const now = new Date();
    const [row] = await this.db
      .insert(agentSessions)
      .values({
        id: newId("ses"),
        memberId,
        connected: true,
        currentStatus: { state: "idle", action: null, file: null, note: null, at: now.toISOString() },
        lastSeenAt: now,
      })
      .returning();
    if (!row) throw new Error("insert failed");
    return toSession(row);
  }

  async register(sessionId: string, claudeSessionId: string | null, cwd: string | null): Promise<AgentSession> {
    const [row] = await this.db
      .update(agentSessions)
      .set({ claudeSessionId, cwd, lastSeenAt: new Date() })
      .where(eq(agentSessions.id, sessionId))
      .returning();
    if (!row) throw new Error("session missing");
    return toSession(row);
  }

  async setStatus(sessionId: string, status: AgentStatus): Promise<AgentSession> {
    const [current] = await this.db.select().from(agentSessions).where(eq(agentSessions.id, sessionId)).limit(1);
    if (!current) throw new Error("session missing");
    // Preserve the agent-declared note unless the event sets one.
    const merged: AgentStatus = { ...status, note: status.note ?? current.currentStatus?.note ?? null };
    await this.db.insert(statusEvents).values({
      id: newId("evt"),
      sessionId,
      state: merged.state,
      action: merged.action,
      file: merged.file,
      note: merged.note,
      createdAt: new Date(merged.at),
    });
    const [row] = await this.db
      .update(agentSessions)
      .set({ currentStatus: merged, lastSeenAt: new Date() })
      .where(eq(agentSessions.id, sessionId))
      .returning();
    if (!row) throw new Error("session missing");
    return toSession(row);
  }

  async close(sessionId: string): Promise<AgentSession | null> {
    const [current] = await this.db.select().from(agentSessions).where(eq(agentSessions.id, sessionId)).limit(1);
    if (!current) return null;
    const status: AgentStatus = {
      state: "offline",
      action: null,
      file: null,
      note: current.currentStatus?.note ?? null,
      at: new Date().toISOString(),
    };
    const [row] = await this.db
      .update(agentSessions)
      .set({ connected: false, currentStatus: status, lastSeenAt: new Date() })
      .where(eq(agentSessions.id, sessionId))
      .returning();
    return row ? toSession(row) : null;
  }

  /** Mark every session that was left connected (server restart) as offline. */
  async closeAll(): Promise<void> {
    await this.db
      .update(agentSessions)
      .set({ connected: false })
      .where(eq(agentSessions.connected, true));
  }
}
