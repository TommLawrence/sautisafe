/** Human-readable "x ago" for a Date/ISO. */
export function timeAgo(input: string | Date): string {
  const then = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Locale-formatted date/time for a Date/ISO. */
export function fmtDateTime(input?: string | Date | null): string | undefined {
  if (!input) return undefined;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return typeof input === "string" ? input : undefined;
  return d.toLocaleString();
}
