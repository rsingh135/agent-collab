import type { Db } from "../db/client.js";
import { authenticate, type Principal } from "./auth.js";
import { MessageService } from "./messages.js";
import { RoomService } from "./rooms.js";
import { SessionService } from "./sessions.js";

export interface Services {
  rooms: RoomService;
  sessions: SessionService;
  messages: MessageService;
  auth(token: string | undefined): Promise<Principal>;
}

export function createServices(db: Db, publicServerUrl: string): Services {
  return {
    rooms: new RoomService(db, publicServerUrl),
    sessions: new SessionService(db),
    messages: new MessageService(db),
    auth: (token) => authenticate(db, token),
  };
}
