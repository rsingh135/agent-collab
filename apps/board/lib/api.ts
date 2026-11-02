import type { CreateRoomBody, JoinRoomBody, MemberCredentials, MessagesPage } from "@agent-gc/protocol";

export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4100";

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const r = await fetch(SERVER_URL + path, { ...init, headers });
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(body.error ?? `request failed (${r.status})`);
  return body;
}

export const api = {
  createRoom: (body: CreateRoomBody) => request<MemberCredentials>("/rooms", { method: "POST", body: JSON.stringify(body) }),
  joinRoom: (roomId: string, body: JoinRoomBody) =>
    request<MemberCredentials>(`/rooms/${roomId}/join`, { method: "POST", body: JSON.stringify(body) }),
  messages: (roomId: string, token: string, before?: string) =>
    request<MessagesPage>(`/rooms/${roomId}/messages?limit=50${before ? `&before=${before}` : ""}`, { token }),
};

/** Per-room credentials kept in this browser only. */
export interface StoredCreds {
  roomId: string;
  memberId: string;
  memberName: string;
  humanToken: string;
  agentJoinUrl: string;
  inviteCode: string;
}

const key = (roomId: string) => `agentgc:room:${roomId}`;

export function loadCreds(roomId: string): StoredCreds | null {
  try {
    const raw = localStorage.getItem(key(roomId));
    return raw ? (JSON.parse(raw) as StoredCreds) : null;
  } catch {
    return null;
  }
}

export function saveCreds(c: MemberCredentials): StoredCreds {
  const stored: StoredCreds = {
    roomId: c.room.id,
    memberId: c.member.id,
    memberName: c.member.name,
    humanToken: c.humanToken,
    agentJoinUrl: c.agentJoinUrl,
    inviteCode: c.inviteCode,
  };
  try {
    localStorage.setItem(key(c.room.id), JSON.stringify(stored));
  } catch {
    /* private mode: session still works until reload */
  }
  return stored;
}

export function inviteLink(roomId: string, inviteCode: string): string {
  return `${window.location.origin}/r/${roomId}/join?code=${inviteCode}`;
}
