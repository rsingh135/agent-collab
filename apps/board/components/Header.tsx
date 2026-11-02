"use client";
import { useEffect, useState } from "react";
import type { Room } from "@agent-gc/protocol";
import { countdown } from "@/lib/time";
import { Logo } from "./Logo";
import type { Connection } from "@/lib/use-room";

export function Header({
  room,
  connection,
  memberName,
  onInvite,
  onConnectAgent,
}: {
  room: Room | null;
  connection: Connection;
  memberName: string;
  onInvite: () => void;
  onConnectAgent: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const cd = room?.demoDeadline ? countdown(room.demoDeadline, now) : null;

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Logo className="text-sm text-text-2" />
        <span className="hidden text-text-3 sm:inline">/</span>
        <h1 className="truncate text-base font-semibold">{room?.name ?? "…"}</h1>
        {cd && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              cd.over ? "bg-red/15 text-red" : "bg-amber-soft text-amber"
            }`}
          >
            {cd.text}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ConnectionPill connection={connection} />
          <span className="hidden text-sm text-text-2 sm:inline">{memberName}</span>
          <button className="btn" onClick={onInvite}>
            Invite
          </button>
          <button className="btn btn-primary" onClick={onConnectAgent}>
            Connect agent
          </button>
        </div>
      </div>
    </header>
  );
}

function ConnectionPill({ connection }: { connection: Connection }) {
  if (connection === "open") return null;
  const label =
    connection === "connecting" ? "Connecting…" : connection === "reconnecting" ? "Reconnecting…" : "Access revoked";
  return (
    <span className={`text-xs ${connection === "rejected" ? "text-red" : "text-text-3 pulse"}`}>{label}</span>
  );
}
