export const DAY_MS = 86_400_000;

/** Midnight UTC of the given instant. */
export function utcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseYmd(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function ago(date: Date | string | null | undefined): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 36) return `${hr} h ago`;
  const days = Math.round(hr / 24);
  return `${days} d ago`;
}

export const RANGES = [7, 28, 90] as const;
export type Range = (typeof RANGES)[number];

export function parseRange(input: unknown, fallback: Range = 28): Range {
  const n = Number(Array.isArray(input) ? input[0] : input);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : fallback;
}
