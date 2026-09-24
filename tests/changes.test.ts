// Task 16: comparable historical changes. Every cutoff, lookback bound and
// DST boundary below pins a rule from the next-release plan's "Comparable
// changes and time rules" section.
import { describe, expect, it } from "vitest";
import {
  aucklandDateOf,
  aucklandDayStartMs,
  futuresChanges,
  minusAucklandCalendarDays,
  officialRevision,
} from "../lib/changes";
import type { HistoryEntry } from "../lib/history";
import type { FuturesBlock, MilkSnapshot } from "../lib/snapshot";
import type { ChangeOutcome } from "../lib/changes";
import { ann, entry, fut, futuresBlock, historyOf } from "./helpers/history";

const SEASON = "2026/27";
const NOW = Date.parse("2026-09-24T06:00:00Z");

function snapshotOf(
  overrides: {
    futures?: FuturesBlock;
    officialAnnouncedAt?: string;
    noChangeUpdate?: { date: string } | null;
    futuresCheck?: { outcome: "ok" | "retained" | "unavailable"; checkedAt: string; detail?: string | null };
    checks?: false;
  } = {},
): MilkSnapshot {
  const futuresCheck = overrides.futuresCheck ?? {
    outcome: "ok" as const,
    checkedAt: "2026-09-24T06:00:00Z",
  };
  return {
    schemaVersion: 1,
    season: SEASON,
    collectedAt: "2026-09-24T06:00:00Z",
    official: {
      midpoint: 9.5,
      low: 8.5,
      high: 10.5,
      rangeSource: "inline",
      announcedAt: overrides.officialAnnouncedAt ?? "2026-08-28",
      noChangeUpdate: overrides.noChangeUpdate ?? null,
      currency: "NZD",
      unit: "NZD/kgMS",
      sourceUrl: "https://www.fonterra.com/",
      retrievedAt: "2026-09-24T06:00:00Z",
      status: "ok",
    },
    futures: overrides.futures ?? futuresBlock(),
    checks: overrides.checks === false ? undefined : {
      official: { source: "official", checkedAt: "2026-09-24T06:00:00Z", outcome: "ok", detail: null },
      futures: {
        source: "futures",
        checkedAt: futuresCheck.checkedAt,
        outcome: futuresCheck.outcome,
        detail: futuresCheck.outcome === "ok" ? null : (futuresCheck.detail ?? "collection failed"),
      },
    },
  };
}

function comparable(outcome: ChangeOutcome | undefined) {
  if (outcome === undefined || outcome.status !== "comparable") {
    throw new Error(`expected comparable, got ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

const NOT_FRESH = {
  status: "suppressed",
  reason: "endpoint-not-fresh",
  transition: null,
  observationsBegin: null,
} as const;

describe("Auckland calendar helpers", () => {
  it("maps local midnight to its instant on both sides of the September shift", () => {
    // NZST (+12) before 27 Sep 2026; NZDT (+13) after.
    expect(aucklandDayStartMs("2026-09-24")).toBe(Date.parse("2026-09-23T12:00:00Z"));
    expect(aucklandDayStartMs("2026-10-01")).toBe(Date.parse("2026-09-30T11:00:00Z"));
    // The shift day itself: local midnight is still NZST.
    expect(aucklandDayStartMs("2026-09-27")).toBe(Date.parse("2026-09-26T12:00:00Z"));
  });

  it("maps local midnight around the April 2027 shift", () => {
    // NZDT (+13) before the 04:04 fall-back; NZST (+12) after.
    expect(aucklandDayStartMs("2027-04-03")).toBe(Date.parse("2027-04-02T11:00:00Z"));
    expect(aucklandDayStartMs("2027-04-04")).toBe(Date.parse("2027-04-03T11:00:00Z"));
    expect(aucklandDayStartMs("2027-04-06")).toBe(Date.parse("2027-04-05T12:00:00Z"));
  });

  it("labels Auckland calendar dates across the UTC midday boundary", () => {
    expect(aucklandDateOf(Date.parse("2026-09-24T11:59:00Z"))).toBe("2026-09-24");
    expect(aucklandDateOf(Date.parse("2026-09-24T12:00:00Z"))).toBe("2026-09-25");
  });

  it("subtracts calendar days, not 168-hour blocks, across both shifts", () => {
    // 1 Oct 12:00 NZDT minus 7 calendar days is 25 Sep 12:00 NZST: 167 h.
    expect(minusAucklandCalendarDays(Date.parse("2026-10-01T23:00:00Z"), 7)).toBe(
      Date.parse("2026-09-25T00:00:00Z"),
    );
    // Across the autumn shift the interval is 169 h.
    expect(minusAucklandCalendarDays(Date.parse("2027-04-06T23:00:00Z"), 7)).toBe(
      Date.parse("2027-03-30T22:00:00Z"),
    );
  });
});

describe("weekly change", () => {
  it("selects the latest whole-day baseline at or before the cutoff", () => {
    const changes = futuresChanges({
      history: historyOf([
        fut("2026-09-16", 9.5),
        fut("2026-09-17", 9.6), // whole day ends after the cutoff: never eligible
        fut("2026-09-24", 9.7),
      ]),
      snapshot: snapshotOf(),
      nowMs: NOW,
    });
    const weekly = comparable(changes?.weekly);
    expect(weekly.baseline.effective).toEqual({ kind: "date", on: "2026-09-16" });
    expect(weekly.endpoint.effective).toEqual({ kind: "date", on: "2026-09-24" });
    expect(weekly.delta).toBeCloseTo(0.2, 10);
  });

  it("anchors the cutoff on the endpoint observation, not today", () => {
    // Endpoint 22 Sep: cutoff is 15 Sep, so the 15th is ineligible (its whole
    // day ends after the cutoff) and the 14th wins.
    const changes = futuresChanges({
      history: historyOf([
        fut("2026-09-14", 9.45),
        fut("2026-09-15", 9.55),
        fut("2026-09-16", 9.65),
        fut("2026-09-22", 9.7),
      ]),
      snapshot: snapshotOf({ futures: futuresBlock({ tradedAt: "2026-09-22", price: 9.7, last: 9.7 }) }),
      nowMs: NOW,
    });
    expect(comparable(changes?.weekly).baseline.effective).toEqual({ kind: "date", on: "2026-09-14" });
  });

  it("accepts a baseline exactly on the tolerance floor and rejects one day earlier", () => {
    const at = (entries: HistoryEntry[]) =>
      futuresChanges({ history: historyOf(entries), snapshot: snapshotOf(), nowMs: NOW })?.weekly;
    // Endpoint 24 Sep -> cutoff 17 Sep -> floor 10 Sep (inclusive).
    expect(comparable(at([fut("2026-09-10", 9.4), fut("2026-09-24", 9.7)])).baseline.effective).toEqual({
      kind: "date",
      on: "2026-09-10",
    });
    expect(at([fut("2026-09-09", 9.4), fut("2026-09-24", 9.7)])).toEqual({
      status: "suppressed",
      reason: "insufficient-history",
      transition: null,
      observationsBegin: "2026-09-09",
    });
  });

  it("subtracts Auckland calendar days across the September DST boundary", () => {
    const changes = futuresChanges({
      history: historyOf([fut("2026-09-22", 9.4), fut("2026-09-23", 9.5), fut("2026-10-01", 9.7)]),
      snapshot: snapshotOf({
        futures: futuresBlock({
          tradedAt: "2026-10-01",
          quotedAt: "2026-10-01T05:00:00Z",
          retrievedAt: "2026-10-01T06:00:00Z",
        }),
        futuresCheck: { outcome: "ok", checkedAt: "2026-10-01T06:00:00Z" },
      }),
      nowMs: Date.parse("2026-10-01T12:00:00Z"),
    });
    // Calendar-day cutoff is 24 Sep, so the 23rd is eligible; a 168-hour
    // subtraction would land on 23 Sep 11:00Z and skip to the 22nd.
    expect(comparable(changes?.weekly).baseline.effective).toEqual({ kind: "date", on: "2026-09-23" });
  });

  it("subtracts Auckland calendar days across the April DST boundary", () => {
    const changes = futuresChanges({
      history: historyOf([fut("2027-03-28", 9.4), fut("2027-03-29", 9.5), fut("2027-04-06", 9.7)]),
      snapshot: snapshotOf({
        futures: futuresBlock({
          tradedAt: "2027-04-06",
          quotedAt: "2027-04-06T05:00:00Z",
          retrievedAt: "2027-04-06T06:00:00Z",
        }),
        futuresCheck: { outcome: "ok", checkedAt: "2027-04-06T06:00:00Z" },
      }),
      nowMs: Date.parse("2027-04-06T12:00:00Z"),
    });
    expect(comparable(changes?.weekly).baseline.effective).toEqual({ kind: "date", on: "2027-03-29" });
  });

  it("anchors an instant endpoint at its own wall-clock time minus seven days", () => {
    // Endpoint 22:00Z 24 Sep = 10:00 NZST 25 Sep -> cutoff 10:00 NZST 18 Sep
    // (2026-09-17T22:00Z).
    const changes = futuresChanges({
      history: historyOf([
        entry({ effective: { kind: "date", on: "2026-09-18" }, value: 9.6 }),
        entry({ effective: { kind: "date", on: "2026-09-19" }, value: 9.65 }),
        entry({ effective: { kind: "instant", at: "2026-09-17T22:00:00Z", verified: true }, value: 9.55 }),
        entry({ effective: { kind: "instant", at: "2026-09-24T22:00:00Z", verified: true }, value: 9.7 }),
      ]),
      snapshot: snapshotOf({
        futures: futuresBlock({
          tradedAt: "2026-09-25",
          quotedAt: "2026-09-24T23:00:00Z",
          retrievedAt: "2026-09-25T00:00:00Z",
        }),
        futuresCheck: { outcome: "ok", checkedAt: "2026-09-25T00:00:00Z" },
      }),
      nowMs: Date.parse("2026-09-25T02:00:00Z"),
    });
    const weekly = comparable(changes?.weekly);
    // The instant exactly at the cutoff is eligible (inclusive), the 19th is
    // not, and the instant is the later of the two eligible candidates.
    expect(weekly.baseline.effective).toEqual({ kind: "instant", at: "2026-09-17T22:00:00Z", verified: true });
    expect(weekly.delta).toBeCloseTo(0.15, 10);
  });

  it("reports a zero delta for a repeated price at a new effective time", () => {
    const changes = futuresChanges({
      history: historyOf([fut("2026-09-16", 9.7), fut("2026-09-24", 9.7)]),
      snapshot: snapshotOf(),
      nowMs: NOW,
    });
    const weekly = comparable(changes?.weekly);
    expect(weekly.delta).toBe(0);
    expect(weekly.baseline.effective).toEqual({ kind: "date", on: "2026-09-16" });
  });

  it("allows a negative delta and a baseline first seen much later (backfill)", () => {
    const changes = futuresChanges({
      history: historyOf([
        fut("2026-09-16", 9.5, { firstSeenAt: "2026-09-24T05:00:00Z" }),
        fut("2026-09-24", 9.3),
      ]),
      snapshot: snapshotOf({ futures: futuresBlock({ tradedAt: "2026-09-24", price: 9.3, last: 9.3 }) }),
      nowMs: NOW,
    });
    expect(comparable(changes?.weekly).delta).toBeCloseTo(-0.2, 10);
  });
});

describe("since-announcement change", () => {
  const BOTH = historyOf([
    ann("2026-06-12", 9.25),
    ann("2026-08-28", 9.5),
    fut("2026-08-26", 9.6),
    fut("2026-08-27", 9.55),
    fut("2026-08-28", 9.58), // same day as the announcement: unknown time cannot precede the cutoff
    fut("2026-09-16", 9.5),
    fut("2026-09-24", 9.7),
  ]);

  it("cuts off at the latest priced announcement's Auckland day", () => {
    const changes = futuresChanges({ history: BOTH, snapshot: snapshotOf(), nowMs: NOW });
    const since = comparable(changes?.sinceAnnouncement);
    expect(since.baseline.effective).toEqual({ kind: "date", on: "2026-08-27" });
    expect(since.delta).toBeCloseTo(0.15, 10);
    // Weekly is independent: its own cutoff is 17 Sep.
    expect(comparable(changes?.weekly).baseline.effective).toEqual({ kind: "date", on: "2026-09-16" });
  });

  it("accepts an endpoint traded on the announcement day itself", () => {
    const changes = futuresChanges({
      history: historyOf([ann("2026-09-23", 9.5), fut("2026-09-22", 9.6), fut("2026-09-23", 9.7)]),
      snapshot: snapshotOf({
        futures: futuresBlock({ tradedAt: "2026-09-23" }),
        futuresCheck: { outcome: "ok", checkedAt: "2026-09-24T06:00:00Z" },
      }),
      nowMs: NOW,
    });
    const since = comparable(changes?.sinceAnnouncement);
    expect(since.baseline.effective).toEqual({ kind: "date", on: "2026-09-22" });
    expect(since.delta).toBeCloseTo(0.1, 10);
  });

  it("suppresses when no observation postdates the announcement", () => {
    const changes = futuresChanges({
      history: historyOf([ann("2026-09-23", 9.5), fut("2026-09-14", 9.4), fut("2026-09-22", 9.7)]),
      snapshot: snapshotOf({
        futures: futuresBlock({ tradedAt: "2026-09-22" }),
        futuresCheck: { outcome: "ok", checkedAt: "2026-09-24T06:00:00Z" },
      }),
      nowMs: NOW,
    });
    expect(changes?.sinceAnnouncement).toEqual({
      status: "suppressed",
      reason: "insufficient-history",
      transition: null,
      observationsBegin: "2026-09-14",
    });
    // The weekly comparison is unaffected.
    expect(comparable(changes?.weekly).baseline.effective).toEqual({ kind: "date", on: "2026-09-14" });
  });

  it("uses the latest priced announcement; no-change notices never reset it", () => {
    const noChange = futuresChanges({
      history: BOTH,
      snapshot: snapshotOf({ noChangeUpdate: { date: "2026-09-23" } }),
      nowMs: NOW,
    });
    expect(noChange?.sinceAnnouncement).toEqual(
      futuresChanges({ history: BOTH, snapshot: snapshotOf(), nowMs: NOW })?.sinceAnnouncement,
    );
  });

  it("suppresses when the history holds no announcements at all", () => {
    const changes = futuresChanges({
      history: historyOf([fut("2026-09-16", 9.5), fut("2026-09-24", 9.7)]),
      snapshot: snapshotOf(),
      nowMs: NOW,
    });
    expect(changes?.sinceAnnouncement).toEqual({
      status: "suppressed",
      reason: "insufficient-history",
      transition: null,
      observationsBegin: "2026-09-16",
    });
  });
});

describe("comparability of the selected pair", () => {
  it("suppresses when the nearest baseline has another basis and does not search farther back", () => {
    const changes = futuresChanges({
      history: historyOf([
        entry({
          effective: { kind: "instant", at: "2026-09-16T02:00:00Z", verified: true },
          value: 9.5,
          basis: "bid-offer-midpoint",
        }),
        fut("2026-09-02", 9.3),
        fut("2026-09-24", 9.7),
      ]),
      snapshot: snapshotOf(),
      nowMs: NOW,
    });
    expect(changes?.weekly).toEqual({
      status: "suppressed",
      reason: "basis-changed",
      transition: { on: "2026-09-16", from: "bid-offer-midpoint", to: "last-trade" },
      observationsBegin: "2026-09-02",
    });
  });

  it("suppresses through an A→B→A basis excursion", () => {
    const changes = futuresChanges({
      history: historyOf([
        fut("2026-09-16", 9.5),
        entry({
          effective: { kind: "instant", at: "2026-09-20T02:00:00Z", verified: true },
          value: 9.6,
          basis: "bid-offer-midpoint",
        }),
        fut("2026-09-24", 9.7),
      ]),
      snapshot: snapshotOf(),
      nowMs: NOW,
    });
    expect(changes?.weekly).toEqual({
      status: "suppressed",
      reason: "basis-changed",
      transition: { on: "2026-09-20", from: "last-trade", to: "bid-offer-midpoint" },
      observationsBegin: "2026-09-16",
    });
  });

  it("suppresses on a provider change at the baseline", () => {
    const changes = futuresChanges({
      history: historyOf([
        fut("2026-09-16", 9.5, { provider: "acme-feed" }),
        fut("2026-09-24", 9.7),
      ]),
      snapshot: snapshotOf(),
      nowMs: NOW,
    });
    expect(changes?.weekly).toEqual({
      status: "suppressed",
      reason: "source-changed",
      transition: { on: "2026-09-16", from: "acme-feed", to: "nzx" },
      observationsBegin: "2026-09-16",
    });
  });

  it("suppresses on an intervening provider change", () => {
    const changes = futuresChanges({
      history: historyOf([
        fut("2026-09-16", 9.5),
        fut("2026-09-20", 9.6, { provider: "acme-feed" }),
        fut("2026-09-24", 9.7),
      ]),
      snapshot: snapshotOf(),
      nowMs: NOW,
    });
    expect(changes?.weekly).toEqual({
      status: "suppressed",
      reason: "source-changed",
      transition: { on: "2026-09-20", from: "nzx", to: "acme-feed" },
      observationsBegin: "2026-09-16",
    });
  });

  it("never selects a different contract's observations", () => {
    const changes = futuresChanges({
      history: historyOf([
        fut("2026-09-16", 9.5, { market: "MKPZ27" }),
        fut("2026-09-10", 9.4),
        fut("2026-09-24", 9.7),
      ]),
      snapshot: snapshotOf(),
      nowMs: NOW,
    });
    expect(comparable(changes?.weekly).baseline.effective).toEqual({ kind: "date", on: "2026-09-10" });
  });

  it("reports insufficient history when only a wrong contract exists", () => {
    const changes = futuresChanges({
      history: historyOf([fut("2026-09-16", 9.5, { market: "MKPZ27" })]),
      snapshot: snapshotOf(),
      nowMs: NOW,
    });
    expect(changes?.weekly).toEqual({
      status: "suppressed",
      reason: "insufficient-history",
      transition: null,
      observationsBegin: "2026-09-16",
    });
  });
});

describe("request-time freshness gates", () => {
  const comparableHistory = historyOf([fut("2026-09-16", 9.5), fut("2026-09-24", 9.7)]);

  it("suppresses both periods while the futures check retained a value", () => {
    const changes = futuresChanges({
      history: comparableHistory,
      snapshot: snapshotOf({ futuresCheck: { outcome: "retained", checkedAt: "2026-09-24T06:00:00Z" } }),
      nowMs: NOW,
    });
    expect(changes).toEqual({ weekly: NOT_FRESH, sinceAnnouncement: NOT_FRESH });
  });

  it("suppresses both periods when the futures block is unavailable", () => {
    const changes = futuresChanges({
      history: comparableHistory,
      snapshot: snapshotOf({ futures: { status: "unavailable", reason: "not-collected" } }),
      nowMs: NOW,
    });
    expect(changes).toEqual({ weekly: NOT_FRESH, sinceAnnouncement: NOT_FRESH });
  });

  it("returns null when there is no snapshot at all", () => {
    expect(futuresChanges({ history: comparableHistory, snapshot: null, nowMs: NOW })).toBeNull();
  });

  it("suppresses when the check is older than 36 hours, exactly at home on the boundary", () => {
    const at = (checkedAt: string) =>
      futuresChanges({
        history: comparableHistory,
        snapshot: snapshotOf({ futuresCheck: { outcome: "ok", checkedAt } }),
        nowMs: NOW,
      })?.weekly.status;
    expect(at("2026-09-22T18:00:00Z")).toBe("comparable"); // exactly 36 h
    expect(at("2026-09-22T17:59:59Z")).toBe("suppressed");
  });

  it("falls back to retrieval time for staleness when checks are absent", () => {
    const changes = futuresChanges({
      history: comparableHistory,
      snapshot: snapshotOf({
        checks: false,
        futures: futuresBlock({ retrievedAt: "2026-09-22T17:00:00Z" }),
      }),
      nowMs: NOW,
    });
    expect(changes).toEqual({ weekly: NOT_FRESH, sinceAnnouncement: NOT_FRESH });
  });

  it("suppresses when the displayed quote is older than 72 hours at request time", () => {
    const at = (quotedAt: string) =>
      futuresChanges({
        history: comparableHistory,
        snapshot: snapshotOf({ futures: futuresBlock({ quotedAt }) }),
        nowMs: NOW,
      })?.weekly.status;
    expect(at("2026-09-21T06:00:00Z")).toBe("comparable"); // exactly 72 h
    expect(at("2026-09-21T05:59:59Z")).toBe("suppressed");
  });

  it("suppresses when a date-only endpoint's day start is over 72 hours old", () => {
    const history = historyOf([fut("2026-09-13", 9.5), fut("2026-09-21", 9.7)]);
    const snapshot = snapshotOf({
      futures: futuresBlock({
        tradedAt: "2026-09-21",
        quotedAt: "2026-09-23T11:00:00Z",
        retrievedAt: "2026-09-23T11:00:00Z",
      }),
      futuresCheck: { outcome: "ok", checkedAt: "2026-09-23T11:00:00Z" },
    });
    // Day start of 21 Sep is 20 Sep 12:00Z: exactly 72 h before the first now.
    expect(futuresChanges({ history, snapshot, nowMs: Date.parse("2026-09-23T12:00:00Z") })?.weekly.status).toBe(
      "comparable",
    );
    expect(futuresChanges({ history, snapshot, nowMs: Date.parse("2026-09-23T12:00:01Z") })?.weekly.status).toBe(
      "suppressed",
    );
  });
});

describe("empty and mismatched history", () => {
  it("suppresses with no observations to name for an empty or null history", () => {
    const empty = {
      status: "suppressed",
      reason: "insufficient-history",
      transition: null,
      observationsBegin: null,
    };
    expect(futuresChanges({ history: historyOf([]), snapshot: snapshotOf(), nowMs: NOW })).toEqual({
      weekly: empty,
      sinceAnnouncement: empty,
    });
    expect(futuresChanges({ history: null, snapshot: snapshotOf(), nowMs: NOW })).toEqual({
      weekly: empty,
      sinceAnnouncement: empty,
    });
  });

  it("treats a history from another season as absent", () => {
    const changes = futuresChanges({
      history: historyOf([fut("2026-09-16", 9.5), fut("2026-09-24", 9.7)], "2025/26"),
      snapshot: snapshotOf(),
      nowMs: NOW,
    });
    expect(changes?.weekly).toEqual({
      status: "suppressed",
      reason: "insufficient-history",
      transition: null,
      observationsBegin: null,
    });
  });

  it("names the earliest observation when only announcements exist", () => {
    const changes = futuresChanges({
      history: historyOf([ann("2026-08-28", 9.5)]),
      snapshot: snapshotOf(),
      nowMs: NOW,
    });
    expect(changes?.weekly).toEqual({
      status: "suppressed",
      reason: "insufficient-history",
      transition: null,
      observationsBegin: "2026-08-28",
    });
  });
});

describe("official forecast revisions", () => {
  it("summarises the latest priced announcement against the previous one", () => {
    const revision = officialRevision(
      historyOf([ann("2026-06-12", 9.25), ann("2026-08-28", 9.5, { low: 8.5, high: 10.5 })]),
    );
    expect(revision).toEqual({
      current: { on: "2026-08-28", value: 9.5, low: 8.5, high: 10.5 },
      previous: { on: "2026-06-12", value: 9.25, low: null, high: null },
    });
  });

  it("uses the latest revision of an announcement entry", () => {
    const base = ann("2026-08-28", 9.4);
    const revised: HistoryEntry = {
      ...base,
      revisions: [
        ...base.revisions,
        { ...base.revisions[0], payload: { ...base.revisions[0].payload, value: 9.5 } },
      ],
    };
    expect(officialRevision(historyOf([ann("2026-06-12", 9.25), revised]))?.current.value).toBe(9.5);
  });

  it("returns null for a re-announcement at an identical payload", () => {
    expect(officialRevision(historyOf([ann("2026-06-12", 9.5), ann("2026-08-28", 9.5)]))).toBeNull();
  });

  it("returns null for a single announcement or no history", () => {
    expect(officialRevision(historyOf([ann("2026-08-28", 9.5)]))).toBeNull();
    expect(officialRevision(null)).toBeNull();
  });
});
