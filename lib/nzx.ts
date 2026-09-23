// NZX MKP futures reference, adapted from the cot-analysis/tools/dairy proof
// of concept (src/nzx.ts). Fetching lives in the collection Worker.

import type { FuturesReason, FuturesValues, QuoteBasis } from "./snapshot";

export const NZX_SOURCE_URL =
  "https://www.nzx.com/markets/nzx-dairy-derivatives/quotes/futures/MKP";

export type FuturesResult =
  | ({ status: "ok" } & FuturesValues)
  | { status: "unavailable"; reason: FuturesReason };

const OLD_AFTER_MS = 72 * 3_600_000;
const FUTURE_TOLERANCE_MS = 5 * 60_000;

interface RawContract {
  contractCode?: unknown;
  tradeDate?: unknown;
  expiryDate?: unknown;
  bidPrice?: unknown;
  bidVolume?: unknown;
  offerPrice?: unknown;
  offerVolume?: unknown;
  lastPrice?: unknown;
  tradedVolume?: unknown;
  priorDayOpenInterest?: unknown;
  priorSettlement?: unknown;
  currency?: unknown;
  updatedAtDate?: unknown;
}

function num(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? parseFloat(value)
        : NaN;
  return Number.isFinite(n) ? n : null;
}

function positive(value: unknown): number | null {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

function nonNegativeInt(value: unknown): number | null {
  const n = num(value);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
}

// Epochs beyond ECMAScript's date range make Date methods throw or return NaN.
const MAX_EPOCH_MS = 8.64e15;
function usableEpochSeconds(value: unknown): number | null {
  const n = num(value);
  if (n === null || n <= 0 || n * 1000 > MAX_EPOCH_MS) return null;
  return n;
}

// NZX stamps updatedAtDate as Auckland wall-clock misencoded as UTC, so the
// raw value can sit up to 13 h in the future. Recover the real instant by
// round-tripping both possible offsets; fall back to as-UTC when neither fits.
function aucklandWallClockToUtc(epochSeconds: number): number {
  const asUtc = epochSeconds * 1000;
  const wall = new Date(asUtc).toISOString().slice(0, 19).replace("T", ", ");
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  for (const offsetHours of [13, 12]) {
    const candidate = asUtc - offsetHours * 3_600_000;
    if (fmt.format(new Date(candidate)) === wall) return candidate;
  }
  return asUtc;
}

function isoDate(epochSeconds: number): string {
  // Contract dates are NZ midnights; their as-UTC date equals the wall date.
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

function isoInstant(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(".000Z", "Z");
}

// The season's reference settles in the September that closes it: 2026/27 -> MKPU27.
export function expectedMkpContract(season: string): string | null {
  const m = season.match(/^(\d{4})\/(\d{2})$/);
  if (!m) return null;
  const startYear = parseInt(m[1], 10);
  const closeYY = (startYear + 1) % 100;
  if (parseInt(m[2], 10) !== closeYY) return null;
  return `MKPU${String(closeYY).padStart(2, "0")}`;
}

export function parseFuturesReference(
  html: string,
  now: Date,
  season: string,
): FuturesResult {
  const expected = expectedMkpContract(season);
  if (expected === null) {
    return { status: "unavailable", reason: "wrong-season" };
  }
  const startYear = parseInt(season.slice(0, 4), 10);

  const script = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  let queries: unknown = null;
  if (script) {
    try {
      queries = (JSON.parse(script[1]) as {
        props?: { pageProps?: { dehydratedState?: { queries?: unknown } } };
      })?.props?.pageProps?.dehydratedState?.queries;
    } catch {
      queries = null;
    }
  }
  if (!Array.isArray(queries) || queries.length === 0) {
    return { status: "unavailable", reason: "no-next-data" };
  }

  let rows: RawContract[] | null = null;
  for (const query of queries as { queryHash?: unknown; state?: { data?: unknown } }[]) {
    if (typeof query.queryHash !== "string") continue;
    let hash: unknown;
    try {
      hash = JSON.parse(query.queryHash);
    } catch {
      continue;
    }
    if (!Array.isArray(hash) || hash[0] !== "quotes" || hash[1] !== "futures" || hash[2] !== "MKP") {
      continue;
    }
    if (Array.isArray(query.state?.data)) {
      rows = query.state.data as RawContract[];
    }
  }
  if (rows === null) {
    return { status: "unavailable", reason: "no-mkp-curve" };
  }

  const contract = rows.find((row) => row.contractCode === expected);
  if (!contract) {
    return { status: "unavailable", reason: "missing-contract" };
  }

  const expirySeconds = usableEpochSeconds(contract.expiryDate);
  if (expirySeconds === null) {
    return { status: "unavailable", reason: "unverifiable" };
  }
  const expiry = new Date(expirySeconds * 1000);
  if (expiry.getUTCFullYear() !== startYear + 1 || expiry.getUTCMonth() !== 8) {
    return { status: "unavailable", reason: "wrong-season" };
  }
  if (expiry.getTime() <= now.getTime()) {
    return { status: "unavailable", reason: "expired" };
  }
  if (contract.currency !== "NZD") {
    return { status: "unavailable", reason: "wrong-currency" };
  }

  const updatedSeconds = usableEpochSeconds(contract.updatedAtDate);
  if (updatedSeconds === null) {
    return { status: "unavailable", reason: "unverifiable" };
  }
  const quotedMs = aucklandWallClockToUtc(updatedSeconds);
  if (quotedMs > now.getTime() + FUTURE_TOLERANCE_MS) {
    return { status: "unavailable", reason: "future-quote" };
  }
  const stale = now.getTime() - quotedMs > OLD_AFTER_MS;

  const bid = positive(contract.bidPrice);
  const offer = positive(contract.offerPrice);
  const last = positive(contract.lastPrice);
  const priorSettlement = positive(contract.priorSettlement);
  const tradeSeconds = usableEpochSeconds(contract.tradeDate);

  let basis: QuoteBasis;
  let price: number;
  let tradedAt: string | null = null;
  if (bid !== null && offer !== null) {
    if (bid > offer) {
      return { status: "unavailable", reason: "crossed" };
    }
    basis = "bid-offer-midpoint";
    price = (bid + offer) / 2;
  } else if (last !== null && tradeSeconds !== null) {
    basis = "last-trade";
    price = last;
    tradedAt = isoDate(tradeSeconds);
  } else if (priorSettlement !== null) {
    basis = "prior-settlement";
    price = priorSettlement;
  } else {
    return { status: "unavailable", reason: "no-basis" };
  }

  return {
    status: "ok",
    contractCode: expected,
    season,
    expiry: isoDate(expirySeconds),
    basis,
    price,
    bid,
    offer,
    last,
    priorSettlement,
    tradedVolume: nonNegativeInt(contract.tradedVolume),
    bidVolume: nonNegativeInt(contract.bidVolume),
    offerVolume: nonNegativeInt(contract.offerVolume),
    openInterest: nonNegativeInt(contract.priorDayOpenInterest),
    stale,
    currency: "NZD",
    unit: "NZD/kgMS",
    quotedAt: isoInstant(quotedMs),
    tradedAt,
    retrievedAt: isoInstant(now.getTime()),
    sourceUrl: NZX_SOURCE_URL,
  };
}
