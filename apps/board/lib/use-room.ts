"use client";
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  ServerFrame,
  type AgentSession,
  type ClientFrame,
  type Member,
  type Message,
  type Room,
} from "@agent-gc/protocol";
import { SERVER_URL } from "./api";

export type Connection = "connecting" | "open" | "reconnecting" | "rejected";

export interface RoomState {
  connection: Connection;
  room: Room | null;
  members: Member[];
  sessions: AgentSession[];
  messages: Message[];
  /** Last few actions per session id, newest first, from presence frames. */
  history: Record<string, string[]>;
  selfMemberId: string | null;
}

type Action =
  | { type: "conn"; connection: Connection }
  | { type: "frame"; frame: ServerFrame };

const initial: RoomState = {
  connection: "connecting",
  room: null,
  members: [],
  sessions: [],
  messages: [],
  history: {},
  selfMemberId: null,
};

function reducer(state: RoomState, action: Action): RoomState {
  if (action.type === "conn") return { ...state, connection: action.connection };
  const f = action.frame;
  switch (f.type) {
    case "snapshot":
      return {
        ...state,
        connection: "open",
        room: f.snapshot.room,
        members: f.snapshot.members,
        sessions: f.snapshot.sessions,
        messages: f.snapshot.recentMessages,
        selfMemberId: f.self.memberId,
      };
    case "message":
      if (state.messages.some((m) => m.id === f.message.id)) return state;
      return { ...state, messages: [...state.messages, f.message] };
    case "presence": {
      const i = state.sessions.findIndex((s) => s.id === f.session.id);
      const sessions = i >= 0 ? state.sessions.map((s) => (s.id === f.session.id ? f.session : s)) : [f.session, ...state.sessions];
      const action = f.session.status?.action;
      const prev = state.history[f.session.id] ?? [];
      const history =
        action && prev[0] !== action ? { ...state.history, [f.session.id]: [action, ...prev].slice(0, 4) } : state.history;
      return { ...state, sessions, history };
    }
    case "member_joined":
      if (state.members.some((m) => m.id === f.member.id)) return state;
      return { ...state, members: [...state.members, f.member] };
    default:
      return state;
  }
}

export function useRoom(token: string | null) {
  const [state, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!token) return;
    let closed = false;
    let backoff = 500;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const dial = () => {
      const url = new URL("/ws", SERVER_URL);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("token", token);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        backoff = 500;
      };
      ws.onmessage = (ev) => {
        const parsed = ServerFrame.safeParse(JSON.parse(ev.data as string));
        if (parsed.success) dispatch({ type: "frame", frame: parsed.data });
      };
      ws.onclose = (ev) => {
        wsRef.current = null;
        if (closed) return;
        if (ev.code === 4001) {
          dispatch({ type: "conn", connection: "rejected" });
          return;
        }
        dispatch({ type: "conn", connection: "reconnecting" });
        timer = setTimeout(dial, backoff);
        backoff = Math.min(backoff * 2, 10_000);
      };
    };
    dial();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close(1000);
    };
  }, [token]);

  const send = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    const frame: ClientFrame = { type: "send_message", clientId: `b${++seq.current}`, text, to: [], fyi: false };
    ws.send(JSON.stringify(frame));
    return true;
  }, []);

  return { state, send };
}
