import { describe, expect, it } from "vitest";
import historyFixture from "../fixtures/release/history.json";
import {
  HISTORY_MAX_ENTRIES,
  HISTORY_MAX_REVISIONS,
  canonicalIdentity,
  historyEligible,
  latestRevision,
  mergeObservation,
  observationFromAnnouncementRow,
  observationFromFuturesBlock,
  parseSeasonHistory,
  type Observation,
  type SeasonHistory,
} from "../lib/history";
import { futuresBlock } from "./helpers/history";

const PARSER = "test-1";

function emptyHistory(season = "2026/27"): SeasonHistory {
  return { schemaVersion: 1, season, materialisedAt: "2026-09-23T06:00:12Z", entries: [] };
}

function lastTradeObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    series: "mkp-futures",
    provider: "nzx",
    market: "MKPU27",
    basis: "last-trade",
    effective: { kind: "date", on: "2026-09-21" },
    payload: { value: 9.7, low: null, high: null, currency: "NZD", "unit": "NZD/kgMS" },
    publishedAt: null,
    firstSeenAt: "2026-09-22T06:00:09Z",
    parserVersion: PARSER,
    ...overrides,
  };
}

function announcementObservation(overrides: Partial<Observation> = {}): Observation {
  return {
    series: "official-forecast",
    provider: "fonterra",
    market: "2026/27",
    basis: "announcement",
    effective: { kind: "date", on: "2026-09-21" },
    payload: { value: 9.5, low: 8.5, high: 10.5, currency: "NZD", unit: "NZD/kgMS" },
    publishedAt: null,
    firstSeenAt: "2026-09-23T06:00:12Z",
    parserVersion: PARSER,
    ...overrides,
  };
}

describe("canonicalIdentity", () => {
  it("keys on series, provider, market, basis, and effective time", () => {
    const base = lastTradeObservation();
    expect(canonicalIdentity(base)).toBe("mkp-futures|nzx|MKPU27|last-trade|d:2026-09-21");
    expect(canonicalIdentity(lastTradeObservation({ effective: { kind: "date", on: "2026-09-22" } })))
      .not.toBe(canonicalIdentity(base));
    expect(canonicalIdentity(lastTradeObservation({ provider: "sgx-feed" })))
      .not.toBe(canonicalIdentity(base));
  });

  it("excludes verification, payload, and retrieval fields", () => {
    expect(canonicalIdentity(lastTradeObservation({ firstSeenAt: "2027-01-01T00:00:00Z" })))
      .toBe(canonicalIdentity(lastTradeObservation()));
  });
});

describe("mergeObservation", () => {
  it("an identical refetch is a duplicate: nothing moves, not even firstSeenAt", () => {
    const { history } = mergeObservation(emptyHistory(), lastTradeObservation());
    const refetched = mergeObservation(
      history,
      lastTradeObservation({ firstSeenAt: "2026-09-24T06:00:01Z" }),
    );
    expect(refetched.outcome).toBe("duplicate");
    expect(refetched.history.entries).toHaveLength(1);
    expect(refetched.history.entries[0].revisions).toHaveLength(1);
    expect(refetched.history.entries[0].revisions[0].firstSeenAt).toBe("2026-09-22T06:00:09Z");
  });

  it("an activity-only row update does not refresh the price observation", () => {
    // Volume/OI/activity are not part of the canonical payload, so a row that
    // only changed activity merges as a duplicate with the same effective time.
    const { history } = mergeObservation(emptyHistory(), lastTradeObservation());
    const activityOnly = mergeObservation(
      history,
      lastTradeObservation({ firstSeenAt: "2026-09-23T06:00:00Z" }),
    );
    expect(activityOnly.outcome).toBe("duplicate");
    expect(activityOnly.history.entries[0].effective).toEqual({ kind: "date", on: "2026-09-21" });
  });

  it("the same price at a genuinely new effective time is a new observation", () => {
    const { history } = mergeObservation(emptyHistory(), lastTradeObservation());
    const next = mergeObservation(
      history,
      lastTradeObservation({ effective: { kind: "date", on: "2026-09-22" } }),
    );
    expect(next.outcome).toBe("appended");
    expect(next.history.entries).toHaveLength(2);
  });

  it("a changed payload for the same identity creates an immutable revision", () => {
    const { history } = mergeObservation(emptyHistory(), lastTradeObservation());
    const revised = mergeObservation(
      history,
      lastTradeObservation({ payload: { value: 9.8, low: null, high: null, currency: "NZD", unit: "NZD/kgMS" } }),
    );
    expect(revised.outcome).toBe("revised");
    expect(revised.history.entries[0].revisions).toHaveLength(2);
    expect(latestRevision(revised.history.entries[0]).payload.value).toBe(9.8);
    expect(revised.history.entries[0].revisions[0].payload.value).toBe(9.7);
  });

  it("date-only observations on the same day share one identity", () => {
    const { history } = mergeObservation(emptyHistory(), lastTradeObservation());
    const sameDay = mergeObservation(
      history,
      lastTradeObservation({ payload: { value: 9.75, low: null, high: null, currency: "NZD", unit: "NZD/kgMS" } }),
    );
    expect(sameDay.outcome).toBe("revised");
    expect(sameDay.history.entries).toHaveLength(1);
  });

  it("a no-change announcement merges as a duplicate and appends nothing", () => {
    const { history } = mergeObservation(emptyHistory(), announcementObservation());
    const again = mergeObservation(history, announcementObservation());
    expect(again.outcome).toBe("duplicate");
    expect(again.history.entries).toHaveLength(1);
  });

  it("rejects an instant effective time that is not provider-verified", () => {
    const observation = lastTradeObservation({
      basis: "bid-offer-midpoint",
      effective: { kind: "instant", at: "2026-09-21T23:30:00Z", verified: false },
    });
    expect(historyEligible(observation)).toBe(false);
    expect(mergeObservation(emptyHistory(), observation).outcome).toBe("rejected");
  });

  it("rejects beyond the entry and revision budgets", () => {
    const full = emptyHistory();
    for (let i = 0; i < HISTORY_MAX_ENTRIES; i++) {
      full.entries.push({
        identity: `id-${i}`,
        ...lastTradeObservation(),
        effective: { kind: "date", on: `2026-09-${String((i % 20) + 1).padStart(2, "0")}` },
        revisions: [{
          payload: lastTradeObservation().payload,
          publishedAt: null,
          firstSeenAt: "2026-09-22T06:00:09Z",
          parserVersion: PARSER,
        }],
      });
    }
    const beyondEntries = mergeObservation(full, lastTradeObservation({ market: "MKPU28" }));
    expect(beyondEntries.outcome).toBe("rejected");

    const crowded = emptyHistory();
    crowded.entries.push({
      identity: canonicalIdentity(lastTradeObservation()),
      ...lastTradeObservation(),
      revisions: Array.from({ length: HISTORY_MAX_REVISIONS }, (_, i) => ({
        payload: { value: 9.7 + i, low: null, high: null, currency: "NZD" as const, unit: "NZD/kgMS" as const },
        publishedAt: null,
        firstSeenAt: "2026-09-22T06:00:09Z",
        parserVersion: PARSER,
      })),
    });
    const beyondRevisions = mergeObservation(
      crowded,
      lastTradeObservation({ payload: { value: 99, low: null, high: null, currency: "NZD", unit: "NZD/kgMS" } }),
    );
    expect(beyondRevisions.outcome).toBe("rejected");
  });
});

describe("observationFromFuturesBlock", () => {
  it("produces a dated last-trade observation", () => {
    const observation = observationFromFuturesBlock(
      futuresBlock({ tradedAt: "2026-09-21" }),
      PARSER,
    );
    expect(observation).not.toBeNull();
    expect(observation?.market).toBe("MKPU27");
    expect(observation?.effective).toEqual({ kind: "date", on: "2026-09-21" });
    expect(observation?.payload.value).toBe(9.7);
  });

  it("excludes a midpoint quoted only by the page's row-update time", () => {
    const observation = observationFromFuturesBlock(
      futuresBlock({
        basis: "bid-offer-midpoint",
        bid: 9.75,
        offer: 9.85,
        price: 9.8,
        last: null,
        tradedAt: null,
      }),
      PARSER,
    );
    expect(observation).toBeNull();
  });

  it("excludes a prior settlement without session identity", () => {
    const observation = observationFromFuturesBlock(
      futuresBlock({
        basis: "prior-settlement",
        priorSettlement: 9.85,
        last: null,
        tradedAt: null,
      }),
      PARSER,
    );
    expect(observation).toBeNull();
  });
});

describe("observationFromAnnouncementRow", () => {
  it("produces a dated announcement observation under the collected season", () => {
    const observation = observationFromAnnouncementRow(
      {
        label: "Forecast Update",
        date: "2026-09-21",
        midpoint: 9.5,
        low: 8.5,
        high: 10.5,
        rangeSource: "inline",
      },
      "2026/27",
      "2026-09-23T06:00:12Z",
      PARSER,
    );
    expect(observation.series).toBe("official-forecast");
    expect(observation.market).toBe("2026/27");
    expect(observation.effective).toEqual({ kind: "date", on: "2026-09-21" });
    expect(observation.payload).toEqual({
      value: 9.5, low: 8.5, high: 10.5, currency: "NZD", unit: "NZD/kgMS",
    });
    expect(observation.firstSeenAt).toBe("2026-09-23T06:00:12Z");
    expect(observation.parserVersion).toBe(PARSER);
  });
});

describe("parseSeasonHistory", () => {
  it("parses the representative fixture", () => {
    const history = parseSeasonHistory(historyFixture, "2026/27");
    expect(history?.entries).toHaveLength(4);
    const revised = history?.entries.find((e) => e.identity.endsWith("d:2026-09-21") && e.series === "mkp-futures");
    expect(revised?.revisions).toHaveLength(2);
    expect(latestRevision(revised as never).payload.value).toBe(9.7);
  });

  it("rejects a mismatched season", () => {
    expect(parseSeasonHistory(historyFixture, "2025/26")).toBeNull();
  });

  it("rejects a tampered identity", () => {
    const tampered = structuredClone(historyFixture);
    tampered.entries[0].identity = "wrong";
    expect(parseSeasonHistory(tampered, "2026/27")).toBeNull();
  });

  it("rejects duplicate identities", () => {
    const duplicated = structuredClone(historyFixture);
    duplicated.entries[1] = structuredClone(duplicated.entries[0]);
    expect(parseSeasonHistory(duplicated, "2026/27")).toBeNull();
  });

  it("rejects an invalid payload (low above value)", () => {
    const invalid = structuredClone(historyFixture);
    invalid.entries[0].revisions[0].payload.low = 9.9;
    expect(parseSeasonHistory(invalid, "2026/27")).toBeNull();
  });

  it("rejects an unverified instant the write path would never store", () => {
    const unverified = structuredClone(historyFixture) as SeasonHistory;
    const entry = unverified.entries[0];
    entry.effective = { kind: "instant", at: "2026-09-21T23:30:00Z", verified: false };
    entry.identity = canonicalIdentity(entry);
    expect(parseSeasonHistory(unverified, "2026/27")).toBeNull();
  });

  it("rejects an object beyond the entry budget", () => {
    const huge = structuredClone(historyFixture);
    for (let i = 0; i <= HISTORY_MAX_ENTRIES; i++) {
      huge.entries.push(structuredClone(huge.entries[0]));
    }
    expect(parseSeasonHistory(huge, "2026/27")).toBeNull();
  });

  it("rejects unknown schema versions", () => {
    const versioned = structuredClone(historyFixture);
    versioned.schemaVersion = 2;
    expect(parseSeasonHistory(versioned, "2026/27")).toBeNull();
  });
});
