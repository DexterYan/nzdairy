// Farm revenue calculations, run in the browser per the implementation plan.

export const PRICE_STEP = 0.5;

export type ProductionInput =
  | { kind: "valid"; production: number }
  | { kind: "blank" }
  | { kind: "invalid"; reason: "not-a-number" | "too-precise" };

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;
const MAX_DECIMALS = 2;

export function parseProduction(raw: string): ProductionInput {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "blank" };
  if (!PLAIN_NUMBER.test(trimmed)) {
    return { kind: "invalid", reason: "not-a-number" };
  }
  const decimals = trimmed.split(".")[1];
  if (decimals !== undefined && decimals.length > MAX_DECIMALS) {
    return { kind: "invalid", reason: "too-precise" };
  }
  const production = Number(trimmed);
  if (!Number.isFinite(production)) {
    return { kind: "invalid", reason: "not-a-number" };
  }
  return { kind: "valid", production };
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
