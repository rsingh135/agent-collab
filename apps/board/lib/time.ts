export function relative(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

export function countdown(iso: string, now = Date.now()): { text: string; over: boolean } {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return { text: "Demo time", over: true };
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  if (h >= 48) return { text: `Demo in ${Math.floor(h / 24)}d ${h % 24}h`, over: false };
  if (h >= 1) return { text: `Demo in ${h}h ${String(m % 60).padStart(2, "0")}m`, over: false };
  return { text: `Demo in ${m}m`, over: false };
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
