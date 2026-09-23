import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import fixture from "../fixtures/latest-snapshot.json";
import type { FuturesBlock, MilkSnapshot, OfficialForecast } from "../lib/snapshot";
import ComparisonStrip from "./comparison-strip";

afterEach(cleanup);

const snapshot = fixture as unknown as MilkSnapshot;
const official = snapshot.official;
const okFutures = snapshot.futures as Extract<FuturesBlock, { status: "ok" }>;
// The fixture quote is 6.5h old at this clock.
const FIXED_NOW = Date.parse("2026-09-23T06:00:00Z");

function strip(
  withOfficial: OfficialForecast = official,
  withFutures?: FuturesBlock,
  nowMs: number = FIXED_NOW,
) {
  render(
    <ComparisonStrip official={withOfficial} futures={withFutures} now={nowMs} />,
  );
}

describe("comparison strip", () => {
  it("exposes the plotted relationship as an accessible sentence", () => {
    strip(official, okFutures);

    const figure = screen.getByRole("img");
    expect(figure.getAttribute("aria-label")).toBe(
      "Futures $9.88 sits $0.38 above the official midpoint $9.50, inside the published range $8.50 to $10.50.",
    );
  });

  it("direct-labels both markers and keys both series", () => {
    strip(official, okFutures);

    expect(screen.getByText("Official $9.50")).toBeDefined();
    expect(screen.getByText("Futures $9.88")).toBeDefined();
    expect(screen.getByText("Official forecast")).toBeDefined();
    expect(screen.getByText("NZX futures")).toBeDefined();
  });

  it("labels the published range on the boundary ticks", () => {
    strip(official, okFutures);

    expect(screen.getByText("$8.50")).toBeDefined();
    expect(screen.getByText("$10.50")).toBeDefined();
  });

  it("flags an old quote on the futures label", () => {
    strip(official, okFutures, Date.parse("2026-09-27T06:00:00Z"));

    expect(screen.getByText("Futures $9.88 · old quote")).toBeDefined();
  });

  it("renders the official range alone without a key when futures is missing", () => {
    strip(official, undefined);

    expect(screen.getByText("Official $9.50")).toBeDefined();
    expect(screen.queryByText(/Futures/)).toBeNull();
    expect(screen.queryByText("NZX futures")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Official forecast midpoint $9.50 with a published range $8.50 to $10.50.",
    );
  });

  it("renders nothing without a range or a futures price", () => {
    const { container } = render(
      <ComparisonStrip
        official={{ ...official, low: null, high: null, rangeSource: "none" }}
        futures={undefined}
        now={FIXED_NOW}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("ticks the two plotted values when no range is published", () => {
    strip(
      { ...official, low: null, high: null, rangeSource: "none" },
      okFutures,
    );

    expect(screen.getByText("$9.50")).toBeDefined();
    expect(screen.getByText("$9.88")).toBeDefined();
  });

  it("aligns an outlying futures label toward the track interior", () => {
    strip(official, { ...okFutures, price: 8, bid: 7.99, offer: 8.01 });

    const label = screen.getByText("Futures $8.00");
    expect(label.className).toMatch(/edgeLeft/);
  });
});
