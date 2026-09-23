import { describe, expect, it } from "vitest";
import { labelEdge, stripAria, stripScale } from "../lib/comparison-scale";

const close = (actual: number, expected: number) =>
  expect(actual).toBeCloseTo(expected, 10);

// Domain tests assert on geometry; a null scale is a failure, not a case.
const mustScale = (inputs: Parameters<typeof stripScale>[0]) => {
  const scale = stripScale(inputs);
  if (scale === null) throw new Error(`expected a scale: ${JSON.stringify(inputs)}`);
  return scale;
};

describe("stripScale domain", () => {
  it("spans the range plus futures with 2% padding on each side", () => {
    const scale = mustScale({ midpoint: 9.5, low: 8.5, high: 10.5, futures: 9.88 });

    close(scale.domainMin, 8.46);
    close(scale.domainMax, 10.54);
    close(scale.officialFraction, 0.5);
    close(scale.futuresFraction ?? NaN, (9.88 - 8.46) / 2.08);
  });

  it("keeps a futures price above the range interior to the track", () => {
    const scale = mustScale({ midpoint: 9.5, low: 9, high: 10, futures: 11 });

    close(scale.domainMin, 8.96);
    close(scale.domainMax, 11.04);
    close(scale.futuresFraction ?? NaN, 2.04 / 2.08);
    expect(scale.futuresFraction ?? 0).toBeGreaterThan(0);
    expect(scale.futuresFraction ?? 1).toBeLessThan(1);
  });

  it("keeps a futures price below the range interior to the track", () => {
    const scale = mustScale({ midpoint: 9.5, low: 9, high: 10, futures: 8 });

    close(scale.domainMin, 7.96);
    close(scale.domainMax, 10.04);
    close(scale.futuresFraction ?? NaN, 0.04 / 2.08);
    expect(scale.futuresFraction ?? 0).toBeGreaterThan(0);
    expect(scale.futuresFraction ?? 1).toBeLessThan(1);
  });

  it("enforces the $0.50 minimum span when all values are equal", () => {
    const scale = mustScale({ midpoint: 9.5, low: 9.5, high: 9.5, futures: 9.5 });

    close(scale.domainMin, 9.24);
    close(scale.domainMax, 9.76);
    close(scale.officialFraction, 0.5);
    close(scale.futuresFraction ?? NaN, 0.5);
  });

  it("covers only the published range when futures is unavailable", () => {
    const scale = mustScale({ midpoint: 9.5, low: 8.5, high: 10.5, futures: null });

    close(scale.domainMin, 8.46);
    close(scale.domainMax, 10.54);
    expect(scale.futuresFraction).toBeNull();
    expect(scale.ticks.map((tick) => tick.value)).toEqual([8.5, 10.5]);
  });

  it("builds the no-range domain from the midpoint and futures price", () => {
    const scale = mustScale({ midpoint: 9.5, low: null, high: null, futures: 9.88 });

    // Raw span 0.38 < $0.50, so the domain widens to ±0.25 around 9.69, then pads.
    close(scale.domainMin, 9.69 - 0.26);
    close(scale.domainMax, 9.69 + 0.26);
    expect(scale.ticks.map((tick) => tick.value)).toEqual([9.5, 9.88]);
  });

  it("renders nothing when there is neither a range nor a futures price", () => {
    expect(stripScale({ midpoint: 9.5, low: null, high: null, futures: null })).toBeNull();
  });

  it("marks tick labels near the domain edges for interior alignment", () => {
    const scale = mustScale({ midpoint: 9.5, low: 8.5, high: 10.5, futures: 9.88 });

    expect(scale.ticks[0].edge).toBe("left");
    expect(scale.ticks[1].edge).toBe("right");
  });
});

describe("labelEdge", () => {
  it("classifies label alignment by distance from the domain edge", () => {
    expect(labelEdge(0.02)).toBe("left");
    expect(labelEdge(0.14)).toBe("left");
    expect(labelEdge(0.16)).toBe("center");
    expect(labelEdge(0.5)).toBe("center");
    expect(labelEdge(0.86)).toBe("right");
    expect(labelEdge(0.98)).toBe("right");
  });
});

describe("stripAria", () => {
  it("states where futures sits relative to the midpoint and range", () => {
    expect(
      stripAria({ midpoint: 9.5, low: 8.5, high: 10.5, futures: 9.88 }),
    ).toBe(
      "Futures $9.88 sits $0.38 above the official midpoint $9.50, inside the published range $8.50 to $10.50.",
    );
  });

  it("says below and outside for a futures price under the range", () => {
    expect(stripAria({ midpoint: 9.5, low: 9, high: 10, futures: 8 })).toBe(
      "Futures $8.00 sits $1.50 below the official midpoint $9.50, outside the published range $9.00 to $10.00.",
    );
  });

  it("says matches when the futures price equals the midpoint", () => {
    expect(stripAria({ midpoint: 9.5, low: 9, high: 10, futures: 9.5 })).toBe(
      "Futures $9.50 matches the official midpoint $9.50, inside the published range $9.00 to $10.00.",
    );
  });

  it("omits the range clause when no range is published", () => {
    expect(stripAria({ midpoint: 9.5, low: null, high: null, futures: 9.88 })).toBe(
      "Futures $9.88 sits $0.38 above the official midpoint $9.50.",
    );
  });

  it("describes the official forecast alone when futures is unavailable", () => {
    expect(stripAria({ midpoint: 9.5, low: 8.5, high: 10.5, futures: null })).toBe(
      "Official forecast midpoint $9.50 with a published range $8.50 to $10.50.",
    );
  });

  it("returns null when no strip can be drawn", () => {
    expect(stripAria({ midpoint: 9.5, low: null, high: null, futures: null })).toBeNull();
  });
});
