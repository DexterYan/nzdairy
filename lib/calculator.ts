// Farm revenue calculations, run in the browser per the implementation plan.

export const PRICE_STEP = 0.5;

export type ParsedNumber =
  | { kind: "valid"; value: number }
  | { kind: "blank" }
  | { kind: "invalid"; reason: "not-a-number" | "too-precise" };

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;
const MAX_PRODUCTION_DECIMALS = 2;
const MAX_PRICE_DECIMALS = 3;

export function parseProduction(raw: string): ParsedNumber {
  return parseDecimal(raw, MAX_PRODUCTION_DECIMALS);
}

export function parsePriceInput(raw: string): ParsedNumber {
  return parseDecimal(raw, MAX_PRICE_DECIMALS);
}

function parseDecimal(raw: string, maxDecimals: number): ParsedNumber {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "blank" };
  if (!PLAIN_NUMBER.test(trimmed)) {
    return { kind: "invalid", reason: "not-a-number" };
  }
  const decimals = trimmed.split(".")[1];
  if (decimals !== undefined && decimals.length > maxDecimals) {
    return { kind: "invalid", reason: "too-precise" };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { kind: "invalid", reason: "not-a-number" };
  }
  return { kind: "valid", value };
}

export function grossRevenue(production: number, price: number): number {
  return production * price;
}

export function priceSensitivity(production: number): number {
  return production * PRICE_STEP;
}

const wholeNzd = new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 0 });

export function formatRevenue(value: number): string {
  return `NZ$${wholeNzd.format(value)}`;
}
