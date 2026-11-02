"use client";
import { useEffect, useState } from "react";
import type { AgentSession, Member } from "@agent-gc/protocol";
import { Lane } from "./Lane";

/** Pick the session to show for a member: a connected one, else the most recently seen. */
export function sessionFor(member: Member, sessions: AgentSession[]): AgentSession | null {
  const mine = sessions.filter((s) => s.memberId === member.id);
  if (!mine.length) return null;
  return mine.find((s) => s.connected) ?? mine.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))[0] ?? null;
}

export function Lanes({
  members,
  sessions,
  history,
  selfMemberId,
  onConnectAgent,
}: {
  members: Member[];
  sessions: AgentSession[];
  history: Record<string, string[]>;
  selfMemberId: string | null;
  onConnectAgent: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const ordered = [...members].sort((a, b) => (a.id === selfMemberId ? -1 : b.id === selfMemberId ? 1 : a.createdAt.localeCompare(b.createdAt)));
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
      {ordered.map((m) => {
        const s = sessionFor(m, sessions);
        return (
          <Lane
            key={m.id}
            member={m}
            session={s}
            history={s ? (history[s.id] ?? []) : []}
            isSelf={m.id === selfMemberId}
            now={now}
            onConnectAgent={onConnectAgent}
          />
        );
      })}
    </div>
  );
}
