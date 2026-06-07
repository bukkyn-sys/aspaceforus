// Pure ledger maths — split-aware net balance. split_ratio is the VIEWER-relative
// "my share" fraction stored on each entry (0.5 = even split).

export interface SplitEntry {
  amount: string | number;
  split_ratio?: string | number | null;
  paid_by: string;
}

function num(v: string | number | null | undefined, fallback = 0): number {
  if (v == null) return fallback;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Net balance between you and your partner across the given (unsettled) entries.
 * Positive → your partner owes you; negative → you owe your partner.
 */
export function netBalance(entries: SplitEntry[], meId: string): number {
  let youOwe = 0;
  let theyOwe = 0;
  for (const e of entries) {
    const amt = num(e.amount);
    const ratio = num(e.split_ratio, 0.5);
    if (e.paid_by !== meId) youOwe += amt * ratio;        // they paid → you owe your share
    else theyOwe += amt * (1 - ratio);                    // you paid → they owe their share
  }
  return theyOwe - youOwe;
}

/** Within a penny of even. */
export function isSettled(net: number): boolean {
  return Math.abs(net) < 0.01;
}
