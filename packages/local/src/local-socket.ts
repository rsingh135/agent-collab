import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./credentials.js";

/** Directory of per-Claude-process unix sockets: <data>/run/<claudePid>.sock */
export function runDir(): string {
  return path.join(dataDir(), "run");
}

export function socketPathFor(pid: number): string {
  return path.join(runDir(), `${pid}.sock`);
}

export type LocalHandler = (request: unknown) => Promise<unknown>;

/** Newline-delimited JSON request/response server over a unix socket. One request per connection. */
export class LocalServer {
  private server: net.Server | null = null;
  constructor(
    public readonly socketPath: string,
    private readonly handler: LocalHandler,
  ) {}

  async listen(): Promise<void> {
    fs.mkdirSync(path.dirname(this.socketPath), { recursive: true, mode: 0o700 });
    try {
      fs.unlinkSync(this.socketPath);
    } catch {
      /* none */
    }
    const server = net.createServer((conn) => {
      let buf = "";
      conn.setEncoding("utf8");
      conn.on("data", (chunk: string) => {
        buf += chunk;
        const nl = buf.indexOf("\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = "";
        let req: unknown;
        try {
          req = JSON.parse(line);
        } catch {
          conn.end(JSON.stringify({ ok: false, error: "bad json" }) + "\n");
          return;
        }
        this.handler(req)
          .then((res) => conn.end(JSON.stringify({ ok: true, result: res }) + "\n"))
          .catch((err: unknown) =>
            conn.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }) + "\n"),
          );
      });
      conn.on("error", () => {});
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    fs.chmodSync(this.socketPath, 0o600);
  }

  close(): void {
    this.server?.close();
    this.server = null;
    try {
      fs.unlinkSync(this.socketPath);
    } catch {
      /* none */
    }
  }
}

/** Send one request and await the single JSON-line response. */
export function localRequest<T = unknown>(socketPath: string, request: unknown, timeoutMs = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath);
    let buf = "";
    const timer = setTimeout(() => {
      conn.destroy();
      reject(new Error("local request timed out"));
    }, timeoutMs);
    conn.setEncoding("utf8");
    conn.on("connect", () => conn.write(JSON.stringify(request) + "\n"));
    conn.on("data", (chunk: string) => (buf += chunk));
    conn.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    conn.on("close", () => {
      clearTimeout(timer);
      try {
        const res = JSON.parse(buf.trim()) as { ok: boolean; result?: T; error?: string };
        if (res.ok) resolve(res.result as T);
        else reject(new Error(res.error ?? "request failed"));
      } catch {
        reject(new Error("empty or invalid local response"));
      }
    });
  });
}

/** Live socket files in the run dir (stale ones whose pid is gone are removed). */
export function listLiveSockets(): Array<{ pid: number; path: string }> {
  let names: string[];
  try {
    names = fs.readdirSync(runDir());
  } catch {
    return [];
  }
  const out: Array<{ pid: number; path: string }> = [];
  for (const name of names) {
    const m = /^(\d+)\.sock$/.exec(name);
    if (!m) continue;
    const pid = Number(m[1]);
    const p = path.join(runDir(), name);
    if (isAlive(pid)) out.push({ pid, path: p });
    else {
      try {
        fs.unlinkSync(p);
      } catch {
        /* none */
      }
    }
  }
  return out;
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
