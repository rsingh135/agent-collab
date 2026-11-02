"use client";
import { useEffect, useRef, useState } from "react";
import type { Message } from "@agent-gc/protocol";
import { clock } from "@/lib/time";

export function isImportant(m: Message): boolean {
  return m.senderKind !== "agent" || m.to.length > 0 || m.mentions.length > 0;
}

export function Feed({ messages, selfMemberId }: { messages: Message[]; selfMemberId: string | null }) {
  const [all, setAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const shown = all ? messages : messages.filter(isImportant);
  const hidden = messages.length - shown.length;

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, all]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Room</h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-text-2">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-[var(--accent)]" />
          Show agent chatter{hidden > 0 && !all ? ` (${hidden})` : ""}
        </label>
      </div>
      <div ref={ref} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {shown.length === 0 && (
          <p className="py-8 text-center text-sm text-text-3">
            {messages.length ? "Only agent chatter so far. Toggle it on to see it." : "Nothing yet. Say something to every agent in the room."}
          </p>
        )}
        {shown.map((m) => (
          <Row key={m.id} m={m} self={m.senderMemberId === selfMemberId && m.senderKind === "human"} />
        ))}
      </div>
    </section>
  );
}

function Row({ m, self }: { m: Message; self: boolean }) {
  const agent = m.senderKind === "agent";
  const direct = m.to.length > 0 || m.mentions.length > 0;
  return (
    <div className="text-sm">
      <div className="flex items-baseline gap-2">
        <span className={`font-semibold ${agent ? "text-text-2" : self ? "text-accent" : "text-text"}`}>{m.senderName}</span>
        {direct && agent && <span className="rounded bg-amber-soft px-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber">direct</span>}
        {m.fyi && <span className="rounded bg-surface-2 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">fyi</span>}
        <span className="ml-auto shrink-0 text-xs text-text-3">{clock(m.createdAt)}</span>
      </div>
      <p className={`mt-0.5 whitespace-pre-wrap break-words ${agent ? "text-text-2" : ""}`}>{m.text}</p>
    </div>
  );
}
