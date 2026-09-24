// Display rules from the implementation plan: references older than 72 hours
// are old, collection checks older than 36 hours are stale. Computed against
// the current time so retained data ages visibly instead of freezing.

export const QUOTE_OLD_AFTER_MS = 72 * 3_600_000;
export const CHECK_STALE_AFTER_MS = 36 * 3_600_000;

export interface Freshness {
  quoteOld: boolean;
  checkStale: boolean;
}

export function freshness(
  quoteAt: string | null,
  checkAt: string,
  nowMs: number,
): Freshness {
  return {
    quoteOld:
      quoteAt !== null && nowMs - Date.parse(quoteAt) > QUOTE_OLD_AFTER_MS,
    checkStale: nowMs - Date.parse(checkAt) > CHECK_STALE_AFTER_MS,
  };
}

// Why a reference cannot be treated as fresh, in gate order; null = fresh.
// The what-changed gates and their explanation sentence share this ladder.
export type ReferenceCause =
  | "retained-value"
  | "failed-check"
  | "stale-check"
  | "old-quote";

export function referenceCause(
  check: { outcome: string } | undefined,
  checkAt: string,
  quotedAt: string | null,
  nowMs: number,
): ReferenceCause | null {
  if (check !== undefined && check.outcome !== "ok") {
    return check.outcome === "retained" ? "retained-value" : "failed-check";
  }
  const { quoteOld, checkStale } = freshness(quotedAt, checkAt, nowMs);
  if (checkStale) return "stale-check";
  if (quoteOld) return "old-quote";
  return null;
}
