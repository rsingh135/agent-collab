"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, saveCreds } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { Field } from "@/components/Field";

export default function CreateRoomPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creator, setCreator] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const creds = await api.createRoom({
        name,
        creatorName: creator,
        ...(deadline ? { demoDeadline: new Date(deadline).toISOString() } : {}),
      });
      saveCreds(creds);
      router.push(`/r/${creds.room.id}?welcome=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Logo className="mb-6 text-lg" />
      <h1 className="text-2xl font-semibold tracking-tight">Start a room</h1>
      <p className="mt-1 text-sm text-text-2">
        One room per team. You get an invite link for teammates and a join line for your own agent.
      </p>
      <form onSubmit={submit} className="card mt-6 space-y-4 p-5">
        <Field label="Project name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pomodoro leaderboard" required maxLength={80} autoFocus />
        </Field>
        <Field label="Your name" hint="Short, no spaces. Teammates' agents will @mention it.">
          <input className="input" value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="ran" required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_.\-]*" />
        </Field>
        <Field label="Demo deadline" hint="Optional. Shows a countdown on the board.">
          <input className="input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red">{error}</p>}
        <button className="btn btn-primary w-full justify-center" disabled={busy}>
          {busy ? "Creating…" : "Create room"}
        </button>
      </form>
    </main>
  );
}

