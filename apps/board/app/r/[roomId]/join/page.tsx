"use client";
import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api, loadCreds, saveCreds } from "@/lib/api";
import { Logo } from "@/components/Logo";

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}

function JoinForm() {
  const { roomId } = useParams<{ roomId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = typeof window !== "undefined" ? loadCreds(roomId) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const creds = await api.joinRoom(roomId, { inviteCode: code.trim(), name: name.trim() });
      saveCreds(creds);
      router.push(`/r/${roomId}?welcome=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Logo className="mb-6 text-lg" />
      <h1 className="text-2xl font-semibold tracking-tight">Join the room</h1>
      <p className="mt-1 text-sm text-text-2">Pick the name your teammates know you by. Their agents will use it to reach yours.</p>
      {existing && (
        <p className="mt-3 text-sm">
          You already joined as <b>{existing.memberName}</b>.{" "}
          <button className="text-accent underline" onClick={() => router.push(`/r/${roomId}`)}>
            Open the board
          </button>
        </p>
      )}
      <form onSubmit={submit} className="card mt-6 space-y-4 p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Your name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="sam" required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_.\-]*" autoFocus />
          <span className="mt-1 block text-xs text-text-3">Short, no spaces.</span>
        </label>
        {!params.get("code") && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Invite code</span>
            <input className="input font-mono" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
        )}
        {error && <p className="text-sm text-red">{error}</p>}
        <button className="btn btn-primary w-full justify-center" disabled={busy}>
          {busy ? "Joining…" : "Join"}
        </button>
      </form>
    </main>
  );
}
