import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";

const RoomCreds = z.object({
  server: z.string(),
  roomId: z.string(),
  token: z.string(),
  /** Working directories this room has been joined from, most recent last. */
  cwds: z.array(z.string()).default([]),
  joinedAt: z.string(),
});
export type RoomCreds = z.infer<typeof RoomCreds>;

const File = z.object({ version: z.literal(1), rooms: z.record(RoomCreds) });
type File = z.infer<typeof File>;

export function dataDir(): string {
  return process.env.CLAUDE_PLUGIN_DATA ?? path.join(os.homedir(), ".agent-gc");
}

export class CredentialStore {
  constructor(private readonly file = path.join(dataDir(), "credentials.json")) {}

  private read(): File {
    try {
      const parsed = File.safeParse(JSON.parse(fs.readFileSync(this.file, "utf8")));
      if (parsed.success) return parsed.data;
    } catch {
      /* missing or corrupt: start fresh */
    }
    return { version: 1, rooms: {} };
  }

  private write(data: File): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  save(creds: Omit<RoomCreds, "cwds" | "joinedAt">, cwd: string | null): RoomCreds {
    const data = this.read();
    const existing = data.rooms[creds.roomId];
    const cwds = existing?.cwds.filter((c) => c !== cwd) ?? [];
    if (cwd) cwds.push(cwd);
    const next: RoomCreds = { ...creds, cwds, joinedAt: existing?.joinedAt ?? new Date().toISOString() };
    data.rooms[creds.roomId] = next;
    this.write(data);
    return next;
  }

  get(roomId: string): RoomCreds | undefined {
    return this.read().rooms[roomId];
  }

  /** The room most recently joined from this cwd (or its parents), if any. */
  forCwd(cwd: string): RoomCreds | undefined {
    const rooms = Object.values(this.read().rooms);
    let best: RoomCreds | undefined;
    let bestLen = -1;
    for (const r of rooms) {
      for (const c of r.cwds) {
        if ((cwd === c || cwd.startsWith(c + path.sep)) && c.length > bestLen) {
          best = r;
          bestLen = c.length;
        }
      }
    }
    return best;
  }

  remove(roomId: string): void {
    const data = this.read();
    delete data.rooms[roomId];
    this.write(data);
  }

  all(): RoomCreds[] {
    return Object.values(this.read().rooms);
  }
}
