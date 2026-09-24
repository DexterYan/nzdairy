// Task 17b: season history figure and table equivalent. Tests pin the
// next-release design §4 contract: line breaks, gaps, revisions, band,
// labels, and full text equivalence for the plotted numbers.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SeasonHistory } from "../lib/history";
import { ann, entry, fut, historyOf } from "../tests/helpers/history";
import HistoryPanel from "./history-panel";

afterEach(cleanup);

function panel(history: SeasonHistory | null, contract: string | null = "MKPU27") {
  render(<HistoryPanel history={history} season="2026/27" contract={contract} />);
}

const svg = () => document.querySelector("svg") as SVGSVGElement;
const qsa = (selector: string) => [...document.querySelectorAll(selector)];
const texts = (selector: string) =>
  qsa(selector).map((el) => (el.textContent ?? "").trim());

// Two announcements with ranges plus three same-basis futures points whose
// 16→21 Sep gap exceeds 72 h while 13→16 sits exactly on the boundary.
const FULL = historyOf([
  ann("2026-08-28", 9.25, { low: 8.75, high: 9.75 }),
  ann("2026-09-21", 9.5, { low: 8.5, high: 10.5 }),
  fut("2026-09-13", 9.6),
  fut("2026-09-16", 9.65),
  fut("2026-09-21", 9.7, { earlierValue: 9.65 }),
]);

describe("season history section", () => {
  it("offers the section as a named landmark with a heading", () => {
    panel(FULL);

    expect(screen.getByRole("region", { name: "Season history" })).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Season history" }),
    ).toBeDefined();
  });

  it("summarises the figure for assistive technology", () => {
    panel(FULL);

    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Futures observations from 13 Sep to 21 Sep between $9.60 and $9.70; forecast $9.50 since 21 Sep, range $8.50–$10.50.",
    );
  });

  it("draws one point marker per futures observation and a step path for announcements", () => {
    panel(FULL);

    expect(qsa("svg circle").length).toBe(3);
    expect(qsa('svg path[class*="historyStep"]').length).toBe(1);
  });

  it("breaks the futures line only across gaps over 72 hours", () => {
    panel(FULL);

    // 13→16 Sep is exactly 72 h (joined); 16→21 Sep exceeds it (broken).
    expect(qsa("svg polyline").length).toBe(2);
  });

  it("breaks the line at a basis change even when the dates are adjacent", () => {
    panel(
      historyOf([
        fut("2026-09-13", 9.6),
        entry({
          effective: { kind: "instant", at: "2026-09-14T02:00:00Z", verified: true },
          value: 9.62,
          basis: "bid-offer-midpoint",
        }),
        fut("2026-09-16", 9.65),
      ]),
    );

    expect(qsa("svg polyline").length).toBe(3);
  });

  it("breaks the line at a provider change", () => {
    panel(
      historyOf([
        fut("2026-09-13", 9.6),
        fut("2026-09-16", 9.65, { provider: "acme-feed" }),
      ]),
    );

    expect(qsa("svg polyline").length).toBe(2);
  });

  it("shades each published range segment and captions the band", () => {
    panel(FULL);

    expect(qsa('svg rect[class*="historyBand"]').length).toBe(2);
    expect(
      screen.getByText(
        "The shaded band is the published forecast range, not a probability range.",
      ),
    ).toBeDefined();
  });

  it("keeps the step line alone when no range is published", () => {
    panel(
      historyOf([
        ann("2026-08-28", 9.25),
        fut("2026-09-13", 9.6),
        fut("2026-09-16", 9.65),
      ]),
    );

    expect(qsa('svg rect[class*="historyBand"]').length).toBe(0);
    expect(
      screen.queryByText(
        "The shaded band is the published forecast range, not a probability range.",
      ),
    ).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).not.toContain(
      "range",
    );
  });

  it("labels only the first and latest value of each series", () => {
    panel(FULL);

    expect(texts('svg text[class*="historyValue"]')).toEqual([
      "$9.25",
      "$9.50",
      "$9.60",
      "$9.70",
    ]);
  });

  it("spaces month labels at most every second month", () => {
    panel(FULL);

    expect(texts('svg text[class*="historyMonth"]')).toEqual(["Jun", "Aug"]);
  });

  it("draws at most five gridlines", () => {
    panel(FULL);

    expect(qsa('svg line[class*="historyGrid"]').length).toBeLessThanOrEqual(5);
    expect(qsa('svg line[class*="historyGrid"]').length).toBeGreaterThanOrEqual(2);
  });

  it("plots only the latest revision", () => {
    panel(FULL);

    // The 21 Sep entry carries revisions 9.65 → 9.70; only 9.70 is plotted.
    expect(texts('svg text[class*="historyValue"]')).toContain("$9.70");
    expect(texts('svg text[class*="historyValue"]')).not.toContain("$9.65");
  });
});

describe("history table equivalent", () => {
  it("states the observation count in the summary", () => {
    panel(FULL);

    expect(
      screen.getByText("Show these observations as a table (5 observations)"),
    ).toBeDefined();
  });

  it("lists observations newest first with the contracted columns", () => {
    panel(FULL);

    const table = document.querySelector("table");
    expect(table).not.toBeNull();
    expect(
      texts("table thead th"),
    ).toEqual(["Date", "Series", "Value", "Basis", "Note"]);
    const firstRow = document.querySelector("tbody tr");
    expect(firstRow?.textContent).toContain("21 Sept 2026");
  });

  it("names the series, basis, and revisions per row", () => {
    panel(FULL);

    const body = document.querySelector("table")?.textContent ?? "";
    expect(body).toContain("Official forecast");
    expect(body).toContain("Futures");
    expect(body).toContain("last trade");
    expect(body).toContain("announcement");
    expect(body).toContain("revised from $9.65");
  });

  it("surfaces gap intervals and basis changes in the Note column", () => {
    panel(FULL);

    const body = document.querySelector("table")?.textContent ?? "";
    expect(body).toContain("no verified observation 17–20 Sep");

    cleanup();
    panel(
      historyOf([
        fut("2026-09-13", 9.6),
        entry({
          effective: { kind: "instant", at: "2026-09-14T02:00:00Z", verified: true },
          value: 9.62,
          basis: "bid-offer-midpoint",
        }),
      ]),
    );
    expect(document.querySelector("table")?.textContent).toContain(
      "basis changed to bid/offer midpoint",
    );
  });

  it("carries every plotted number in text form", () => {
    panel(FULL);

    const table = document.querySelector("table")?.textContent ?? "";
    for (const value of ["$9.25", "$9.50", "$9.60", "$9.65", "$9.70"]) {
      expect(table).toContain(value);
    }
  });
});

describe("history empty states", () => {
  it("frames a building season with its first observation", () => {
    panel(historyOf([fut("2026-09-16", 9.6, { market: "MKPZ27" })]));

    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          "History for the 2026/27 season is still building — observations begin 16 Sept 2026.",
      ),
    ).toBeDefined();
    expect(screen.getByText(/current reference prices above/)).toBeDefined();
    expect(svg()).toBeNull();
    expect(document.querySelector("details")).toBeNull();
  });

  it("drops the begin clause when no history exists at all", () => {
    panel(null);

    expect(
      screen.getByText(
        (_, element) =>
          element?.textContent ===
          "History for the 2026/27 season is still building.",
      ),
    ).toBeDefined();
    expect(document.querySelector("details")).toBeNull();
  });

  it("renders announcements alone without futures points", () => {
    panel(historyOf([ann("2026-08-28", 9.25, { low: 8.75, high: 9.75 })]));

    expect(qsa("svg circle").length).toBe(0);
    expect(qsa("svg polyline").length).toBe(0);
    expect(qsa('svg path[class*="historyStep"]').length).toBe(1);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "No futures observations yet; forecast $9.25 since 28 Aug, range $8.75–$9.75.",
    );
  });
});
