import { describe, expect, it } from "vitest";
import { freshness } from "../lib/freshness";

const QUOTED_AT = "2026-09-20T00:00:00Z";
const QUOTE_MS = Date.parse(QUOTED_AT);
const SEVENTY_TWO_HOURS_MS = 72 * 3_600_000;
const THIRTY_SIX_HOURS_MS = 36 * 3_600_000;

describe("freshness display rules", () => {
  it("labels a quote old only once it is more than 72 hours old", () => {
    const exact = freshness(QUOTED_AT, QUOTED_AT, QUOTE_MS + SEVENTY_TWO_HOURS_MS);
    const older = freshness(
      QUOTED_AT,
      QUOTED_AT,
      QUOTE_MS + SEVENTY_TWO_HOURS_MS + 1,
    );

    expect(exact.quoteOld).toBe(false);
    expect(older.quoteOld).toBe(true);
  });

  it("labels a check stale only once it is more than 36 hours old", () => {
    const checkedAt = "2026-09-20T00:00:00Z";
    const checkMs = Date.parse(checkedAt);
    const exact = freshness(QUOTED_AT, checkedAt, checkMs + THIRTY_SIX_HOURS_MS);
    const older = freshness(QUOTED_AT, checkedAt, checkMs + THIRTY_SIX_HOURS_MS + 1);

    expect(exact.checkStale).toBe(false);
    expect(older.checkStale).toBe(true);
  });

  it("never labels a quote without a quote timestamp old", () => {
    const freshnessWithoutQuote = freshness(null, QUOTED_AT, QUOTE_MS + 400 * 3_600_000);

    expect(freshnessWithoutQuote.quoteOld).toBe(false);
  });

  it("does not age a quote that carries a future timestamp", () => {
    const ahead = freshness(QUOTED_AT, QUOTED_AT, QUOTE_MS - 1);

    expect(ahead.quoteOld).toBe(false);
    expect(ahead.checkStale).toBe(false);
  });
});
