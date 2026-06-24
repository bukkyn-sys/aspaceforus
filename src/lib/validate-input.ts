// Server-side input hardening. The DB/RPCs don't bound free-text length, so a
// crafted client could store multi-MB strings (storage + egress cost abuse).
// These helpers trim and hard-cap stored text. Caps are generous — real input
// is far below them — so legitimate use is never affected.

export const LIMITS = {
  title: 200,
  name: 100,
  note: 4000,      // shared note line / vault notes
  caption: 1000,
  url: 2048,
  category: 60,
  priceRange: 60,
  emoji: 16,
  currency: 8,
  owner: 64,
} as const;

/** Trim + cap an optional string; empty → null (matches the actions' `|| null`). */
export function clampText(v: string | null | undefined, max: number): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

/** Trim + cap a required string (never null). */
export function clampRequired(v: string | null | undefined, max: number): string {
  return (v ?? "").trim().slice(0, max);
}
