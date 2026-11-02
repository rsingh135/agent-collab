"use client";
import type { AgentSession, Member } from "@agent-gc/protocol";
import { relative } from "@/lib/time";

export function Lane({
  member,
  session,
  history,
  isSelf,
  now,
  onConnectAgent,
}: {
  member: Member;
  session: AgentSession | null;
  history: string[];
  isSelf: boolean;
  now: number;
  onConnectAgent: () => void;
}) {
  const status = session?.status ?? null;
  const state = !session || !session.connected ? "offline" : (status?.state ?? "idle");
  const dot =
    state === "working" ? "dot-working pulse" : state === "waiting_on_human" ? "dot-waiting" : state === "idle" ? "dot-idle" : "dot-offline";
  const line = !session
    ? "no agent connected"
    : !session.connected
      ? "agent offline"
      : (status?.action ?? (state === "idle" ? "idle" : "working"));
  const when = status?.at ?? session?.lastSeenAt;

  return (
    <section className={`card flex min-h-[200px] flex-col p-4 ${state === "waiting_on_human" ? "border-amber/60" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="truncate text-sm font-semibold">
          {member.name}
          {isSelf && <span className="ml-1 font-normal text-text-3">(you)</span>}
          <span className="font-normal text-text-3"> + {member.agentLabel ?? "agent"}</span>
        </h2>
        {member.area && <span className="truncate text-xs text-text-3">{member.area}</span>}
      </div>

      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className={`dot ${dot}`} aria-hidden />
        <span className={`truncate ${state === "offline" ? "text-text-3" : state === "waiting_on_human" ? "text-amber" : "text-text"}`}>
          {line}
        </span>
        {when && session && <span className="ml-auto shrink-0 text-xs text-text-3">{relative(when, now)}</span>}
      </div>

      {status?.note && (
        <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="text-text-3">on </span>
          {status.note}
        </div>
      )}

      {history.length > 1 && (
        <ul className="mt-3 space-y-1 text-xs text-text-3">
          {history.slice(1).map((h, i) => (
            <li key={i} className="truncate">
              {h}
            </li>
          ))}
        </ul>
      )}

      {!session && isSelf && (
        <button onClick={onConnectAgent} className="btn mt-auto self-start text-xs">
          Connect your agent
        </button>
      )}
      {!session && !isSelf && <p className="mt-auto text-xs text-text-3">Waiting for {member.name} to connect an agent.</p>}
    </section>
  );
}
