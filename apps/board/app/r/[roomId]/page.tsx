"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { inviteLink, loadCreds, type StoredCreds } from "@/lib/api";
import { useRoom } from "@/lib/use-room";
import { Header } from "@/components/Header";
import { Lanes } from "@/components/Lanes";
import { Feed } from "@/components/Feed";
import { Chat } from "@/components/Chat";
import { Modal } from "@/components/Modal";
import { ConnectAgent } from "@/components/ConnectAgent";
import { CopyField } from "@/components/CopyField";

export default function BoardPage() {
  return (
    <Suspense>
      <Board />
    </Suspense>
  );
}

function Board() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const [creds, setCreds] = useState<StoredCreds | null | undefined>(undefined);
  const [modal, setModal] = useState<"invite" | "agent" | null>(null);

  useEffect(() => {
    const c = loadCreds(roomId);
    setCreds(c);
    if (!c) router.replace(`/r/${roomId}/join`);
    else if (params.get("welcome")) {
      setModal("agent");
      router.replace(`/r/${roomId}`);
    }
  }, [roomId, router, params]);

  const { state, send } = useRoom(creds?.humanToken ?? null);

  if (creds === undefined || creds === null) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        room={state.room}
        connection={state.connection}
        memberName={creds.memberName}
        onInvite={() => setModal("invite")}
        onConnectAgent={() => setModal("agent")}
      />
      <main className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 px-4 py-4 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <Lanes
            members={state.members}
            sessions={state.sessions}
            history={state.history}
            selfMemberId={state.selfMemberId}
            onConnectAgent={() => setModal("agent")}
          />
        </div>
        <div className="flex min-h-[420px] flex-col lg:sticky lg:top-[61px] lg:h-[calc(100vh-61px-2rem)]">
          <div className="card flex min-h-0 flex-1 flex-col">
            <Feed messages={state.messages} selfMemberId={state.selfMemberId} />
            <Chat onSend={send} disabled={state.connection !== "open"} />
          </div>
        </div>
      </main>

      {modal === "invite" && (
        <Modal title="Invite teammates" onClose={() => setModal(null)}>
          <p className="mb-3 text-sm text-text-2">Anyone with this link can join the room and connect an agent.</p>
          <CopyField value={inviteLink(roomId, creds.inviteCode)} mono={false} />
        </Modal>
      )}
      {modal === "agent" && (
        <Modal title="Connect your agent" onClose={() => setModal(null)}>
          <ConnectAgent agentJoinUrl={creds.agentJoinUrl} compact />
        </Modal>
      )}
    </div>
  );
}
