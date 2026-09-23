import { describe, expect, it } from "vitest";
import {
  PRICE_STEP,
  formatRevenue,
  grossRevenue,
  parseProduction,
  priceSensitivity,
} from "../lib/calculator";

describe("parseProduction", () => {
  it("accepts a plain whole kgMS figure", () => {
    expect(parseProduction("150000")).toEqual({
      kind: "valid",
      production: 150000,
    });
  });

  it("accepts zero production as a valid result, not a missing one", () => {
    expect(parseProduction("0")).toEqual({ kind: "valid", production: 0 });
  });

  it("accepts at most two decimal places", () => {
    expect(parseProduction("150000.5")).toEqual({
      kind: "valid",
      production: 150000.5,
    });
  });

  it("treats whitespace-padded input by trimming it", () => {
    expect(parseProduction(" 150000 ")).toEqual({
      kind: "valid",
      production: 150000,
    });
  });

  it("reports blank input distinctly so guidance can ask for a value", () => {
    expect(parseProduction("")).toEqual({ kind: "blank" });
    expect(parseProduction("   ")).toEqual({ kind: "blank" });
  });

  it("rejects negatives, words, separators, and exponent notation", () => {
    for (const raw of ["-5", "abc", "1,000", "1e3", "150 000", "+150000"]) {
      expect(parseProduction(raw)).toEqual({
        kind: "invalid",
        reason: "not-a-number",
      });
    }
  });

  it("rejects excessive precision rather than silently rounding", () => {
    expect(parseProduction("150000.125")).toEqual({
      kind: "invalid",
      reason: "too-precise",
    });
  });

  it("rejects inputs that overflow to a non-finite value", () => {
    expect(parseProduction("9".repeat(400))).toEqual({
      kind: "invalid",
      reason: "not-a-number",
    });
  });
});

describe("grossRevenue", () => {
  it("matches the plan example at $9.25", () => {
    expect(grossRevenue(150000, 9.25)).toBe(1387500);
  });

  it("matches the plan example at $9.80", () => {
    expect(grossRevenue(150000, 9.8)).toBe(1470000);
  });

  it("produces zero revenue for zero production", () => {
    expect(grossRevenue(0, 9.5)).toBe(0);
  });

  it("can overflow to a non-finite value, so callers must guard before rendering", () => {
    expect(Number.isFinite(grossRevenue(1e308, 9.25))).toBe(false);
  });
});

describe("priceSensitivity", () => {
  it("is production times the $0.50/kgMS step", () => {
    expect(PRICE_STEP).toBe(0.5);
    expect(priceSensitivity(150000)).toBe(75000);
    expect(priceSensitivity(0)).toBe(0);
  });
});

describe("formatRevenue", () => {
  it("renders whole NZ dollars with separators as in the plan examples", () => {
    expect(formatRevenue(1387500)).toBe("NZ$1,387,500");
    expect(formatRevenue(1470000)).toBe("NZ$1,470,000");
    expect(formatRevenue(75000)).toBe("NZ$75,000");
    expect(formatRevenue(0)).toBe("NZ$0");
  });

  it("rounds fractional revenue to the nearest whole dollar", () => {
    expect(formatRevenue(1387546.25)).toBe("NZ$1,387,546");
  });
});
