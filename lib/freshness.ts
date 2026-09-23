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
