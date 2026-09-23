import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import latestSnapshot from "../fixtures/latest-snapshot.json";
import {
  NZX_SOURCE_URL,
  expectedMkpContract,
  parseFuturesReference,
} from "../lib/nzx";

// Pinned to the live-page capture instant so quote-age expectations never drift.
const NOW = new Date("2026-09-23T00:03:00Z");
const SEASON = "2026/27";

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures/nzx", name), "utf8");
}

describe("expectedMkpContract", () => {
  it("maps a season to its September-settling MKP contract", () => {
    expect(expectedMkpContract("2026/27")).toBe("MKPU27");
    expect(expectedMkpContract("2025/26")).toBe("MKPU26");
  });

  it("rejects season ids that are not a plain year pair", () => {
    expect(expectedMkpContract("2026/7")).toBeNull();
    expect(expectedMkpContract("current")).toBeNull();
  });
});

describe("parseFuturesReference", () => {
  it("selects the two-sided bid/offer midpoint from the real page", () => {
    const result = parseFuturesReference(fixture("page-2026-09.html"), NOW, SEASON);

    expect(result).toEqual({
      status: "ok",
      contractCode: "MKPU27",
      season: "2026/27",
      expiry: "2027-09-30",
      basis: "bid-offer-midpoint",
      price: 9.875,
      bid: 9.75,
      offer: 10.0,
      last: null,
      priorSettlement: 9.85,
      tradedVolume: 0,
      bidVolume: 3,
      offerVolume: 58,
      openInterest: 11351,
      stale: false,
      currency: "NZD",
      unit: "NZD/kgMS",
      // NZX stamps Auckland wall-clock as UTC; 1790163000 is 23 Sep 11:30 NZST.
      quotedAt: "2026-09-22T23:30:00Z",
      tradedAt: null,
      retrievedAt: "2026-09-23T00:03:00Z",
      sourceUrl: NZX_SOURCE_URL,
    });
  });

  it("falls back to a positive last trade with its trade date", () => {
    const result = parseFuturesReference(fixture("last-trade.html"), NOW, SEASON);

    expect(result).toMatchObject({
      status: "ok",
      basis: "last-trade",
      price: 9.9,
      bid: null,
      offer: null,
      last: 9.9,
      tradedAt: "2026-09-22",
    });
  });

  it("falls back to prior settlement when nothing newer is quotable", () => {
    const result = parseFuturesReference(fixture("settlement.html"), NOW, SEASON);

    expect(result).toMatchObject({
      status: "ok",
      basis: "prior-settlement",
      price: 9.85,
      priorSettlement: 9.85,
    });
  });

  it("reports the expected contract missing from the curve", () => {
    const result = parseFuturesReference(fixture("missing-contract.html"), NOW, SEASON);

    expect(result).toEqual({ status: "unavailable", reason: "missing-contract" });
  });

  it("rejects a crossed market rather than quoting its midpoint", () => {
    const result = parseFuturesReference(fixture("crossed.html"), NOW, SEASON);

    expect(result).toEqual({ status: "unavailable", reason: "crossed" });
  });

  it("rejects a contract not priced in NZD", () => {
    const result = parseFuturesReference(fixture("wrong-currency.html"), NOW, SEASON);

    expect(result).toEqual({ status: "unavailable", reason: "wrong-currency" });
  });

  it("rejects an expired contract", () => {
    const result = parseFuturesReference(
      fixture("page-2026-09.html"),
      new Date("2027-10-01T00:00:00Z"),
      SEASON,
    );

    expect(result).toEqual({ status: "unavailable", reason: "expired" });
  });

  it("flags a quote older than 72 hours as stale but still usable", () => {
    const result = parseFuturesReference(fixture("old-quote.html"), NOW, SEASON);

    expect(result).toMatchObject({ status: "ok", stale: true, basis: "bid-offer-midpoint" });
  });

  it("rejects a quote stamped in the future", () => {
    const result = parseFuturesReference(fixture("future-quote.html"), NOW, SEASON);

    expect(result).toEqual({ status: "unavailable", reason: "future-quote" });
  });

  it("rejects a quote whose timestamp cannot be verified", () => {
    const result = parseFuturesReference(fixture("unverifiable.html"), NOW, SEASON);

    expect(result).toEqual({ status: "unavailable", reason: "unverifiable" });
  });

  it("rejects a contract that does not settle in the season's closing September", () => {
    const result = parseFuturesReference(fixture("wrong-season.html"), NOW, SEASON);

    expect(result).toEqual({ status: "unavailable", reason: "wrong-season" });
  });

  it("rejects a page without the embedded quote cache", () => {
    const result = parseFuturesReference(fixture("no-next-data.html"), NOW, SEASON);

    expect(result).toEqual({ status: "unavailable", reason: "no-next-data" });
  });

  it("rejects a cache with no MKP curve", () => {
    const result = parseFuturesReference(fixture("no-mkp-curve.html"), NOW, SEASON);

    expect(result).toEqual({ status: "unavailable", reason: "no-mkp-curve" });
  });

  it("rejects a contract with no quotable price on any basis", () => {
    const result = parseFuturesReference(fixture("no-basis.html"), NOW, SEASON);

    expect(result).toEqual({ status: "unavailable", reason: "no-basis" });
  });

  it("matches the committed fixture snapshot the page renders from", () => {
    const result = parseFuturesReference(
      fixture("page-2026-09.html"),
      new Date(latestSnapshot.collectedAt),
      latestSnapshot.season,
    );

    expect(result).toEqual(latestSnapshot.futures);
  });
});
