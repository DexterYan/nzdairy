import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import latestSnapshot from "../fixtures/latest-snapshot.json";
import {
  FONTERA_SOURCE_URL,
  currentSeason,
  parseOfficialForecast,
} from "../lib/fonterra";

// Pinned so fixture content and season expectations never drift with wall-clock time.
const NOW = new Date("2026-09-23T02:00:00Z");

function fixture(name: string): string {
  return readFileSync(
    resolve(process.cwd(), "tests/fixtures/fonterra", name),
    "utf8",
  );
}

describe("currentSeason", () => {
  it("treats 1 June Auckland as the new season's first day", () => {
    expect(currentSeason(new Date("2026-05-31T10:00:00Z"))).toBe("2025/26");
    expect(currentSeason(new Date("2026-05-31T13:00:00Z"))).toBe("2026/27");
  });
});

describe("parseOfficialForecast", () => {
  it("parses the current-season inline-range update from the real page", () => {
    const result = parseOfficialForecast(fixture("page-2026-09.html"), NOW);

    expect(result).toEqual({
      status: "ok",
      season: "2026/27",
      midpoint: 9.5,
      low: 8.5,
      high: 10.5,
      rangeSource: "inline",
      announcedAt: "2026-09-21",
      noChangeUpdate: null,
      sourceUrl: FONTERA_SOURCE_URL,
    });
  });

  it("applies the footnote range when the latest price carries the * marker", () => {
    const result = parseOfficialForecast(fixture("footnote-range.html"), NOW);

    expect(result).toMatchObject({
      status: "ok",
      midpoint: 9.25,
      low: 8.0,
      high: 10.5,
      rangeSource: "footnote",
      announcedAt: "2026-09-02",
    });
  });

  it("carries forward the previous priced row when the latest update is No Change", () => {
    const result = parseOfficialForecast(fixture("no-change-latest.html"), NOW);

    expect(result).toMatchObject({
      status: "ok",
      midpoint: 9.7,
      low: 9.6,
      high: 9.8,
      rangeSource: "inline",
      announcedAt: "2026-08-21",
      noChangeUpdate: { date: "2026-09-05" },
    });
  });

  it("leaves the range missing when only a single price is published", () => {
    const result = parseOfficialForecast(fixture("missing-range.html"), NOW);

    expect(result).toMatchObject({
      status: "ok",
      midpoint: 9.25,
      low: null,
      high: null,
      rangeSource: "none",
      announcedAt: "2026-09-21",
    });
  });

  it("parses single-dollar ranges like $7.00-7.60 as a range", () => {
    const result = parseOfficialForecast(fixture("loose-range.html"), NOW);

    expect(result).toMatchObject({
      status: "ok",
      midpoint: 7.3,
      low: 7.0,
      high: 7.6,
      rangeSource: "inline",
    });
  });

  it("returns an explicit unavailable state for malformed markup", () => {
    const result = parseOfficialForecast(fixture("malformed.html"), NOW);

    expect(result).toEqual({
      status: "unavailable",
      reason: "no-forecast-tables",
    });
  });

  it("returns an explicit unavailable state when the page has no table for the current season", () => {
    const result = parseOfficialForecast(
      fixture("page-2026-09.html"),
      new Date("2027-07-01T02:00:00Z"),
    );

    expect(result).toEqual({
      status: "unavailable",
      reason: "season-mismatch",
    });
  });

  it("attributes seasons by the page's tab labels, not row dates alone", () => {
    const result = parseOfficialForecast(
      fixture("truncated-previous-season.html"),
      NOW,
    );

    expect(result).toEqual({
      status: "unavailable",
      reason: "season-mismatch",
    });
  });

  it("refuses to fall back to an older forecast when the latest price is unreadable", () => {
    const result = parseOfficialForecast(fixture("unreadable-latest.html"), NOW);

    expect(result).toEqual({
      status: "unavailable",
      reason: "unreadable-latest-update",
    });
  });

  it("refuses announcement dates that are not real calendar dates", () => {
    const result = parseOfficialForecast(
      fixture("invalid-date-latest.html"),
      NOW,
    );

    expect(result).toEqual({
      status: "unavailable",
      reason: "unreadable-latest-update",
    });
  });

  it("rejects price cells with trailing numeric garbage", () => {
    const result = parseOfficialForecast(
      fixture("trailing-garbage-latest.html"),
      NOW,
    );

    expect(result).toEqual({
      status: "unavailable",
      reason: "unreadable-latest-update",
    });
  });

  it("does not carry a price forward across an unreadable announcement", () => {
    const result = parseOfficialForecast(
      fixture("no-change-over-unreadable.html"),
      NOW,
    );

    expect(result).toEqual({
      status: "unavailable",
      reason: "unreadable-latest-update",
    });
  });

  it("treats a recognisable announcement with a missing date as unreadable", () => {
    const result = parseOfficialForecast(fixture("undated-latest.html"), NOW);

    expect(result).toEqual({
      status: "unavailable",
      reason: "unreadable-latest-update",
    });
  });

  it("reads season labels regardless of link attribute order and child markup", () => {
    const result = parseOfficialForecast(
      fixture("truncated-previous-season-varied.html"),
      NOW,
    );

    expect(result).toEqual({
      status: "unavailable",
      reason: "season-mismatch",
    });
  });

  it("matches the committed fixture snapshot the page renders from", () => {
    const result = parseOfficialForecast(fixture("page-2026-09.html"), NOW);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(currentSeason(NOW)).toBe(latestSnapshot.season);
    const persisted = latestSnapshot.official;
    expect(result).toEqual({
      status: "ok",
      season: latestSnapshot.season,
      midpoint: persisted.midpoint,
      low: persisted.low,
      high: persisted.high,
      rangeSource: persisted.rangeSource,
      announcedAt: persisted.announcedAt,
      noChangeUpdate: persisted.noChangeUpdate,
      sourceUrl: persisted.sourceUrl,
    });
  });
});
