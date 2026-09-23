import { expectedMkpContract } from "./nzx";

export const LATEST_SNAPSHOT_KEY = "latest.json";

export type RangeSource = "inline" | "footnote" | "none";

export type QuoteBasis = "bid-offer-midpoint" | "last-trade" | "prior-settlement";

export type FuturesReason =
  | "no-next-data"
  | "no-mkp-curve"
  | "missing-contract"
  | "wrong-season"
  | "expired"
  | "wrong-currency"
  | "crossed"
  | "future-quote"
  | "unverifiable"
  | "no-basis"
  | "not-collected";

export type FuturesValues = {
  contractCode: string;
  season: string;
  expiry: string;
  basis: QuoteBasis;
  price: number;
  bid: number | null;
  offer: number | null;
  last: number | null;
  priorSettlement: number | null;
  tradedVolume: number | null;
  bidVolume: number | null;
  offerVolume: number | null;
  openInterest: number | null;
  stale: boolean;
  currency: "NZD";
  unit: "NZD/kgMS";
  quotedAt: string | null;
  tradedAt: string | null;
  retrievedAt: string;
  sourceUrl: string;
};

export type FuturesBlock =
  | ({ status: "ok" } & FuturesValues)
  | { status: "unavailable"; reason: FuturesReason };

export interface OfficialForecast {
  midpoint: number;
  low: number | null;
  high: number | null;
  rangeSource: RangeSource;
  announcedAt: string;
  noChangeUpdate: { date: string } | null;
  currency: "NZD";
  unit: "NZD/kgMS";
  sourceUrl: string;
  retrievedAt: string;
  status: "ok";
}

export interface MilkSnapshot {
  schemaVersion: 1;
  season: string;
  collectedAt: string;
  official: OfficialForecast;
  futures?: FuturesBlock;
}

export interface SnapshotObject {
  json(): Promise<unknown>;
}

// Structural subset of the Workers R2Bucket interface; the real binding satisfies it.
export interface SnapshotBucket {
  get(key: string): Promise<SnapshotObject | null>;
}

export async function readLatestSnapshot(
  bucket: SnapshotBucket,
): Promise<MilkSnapshot | null> {
  const object = await bucket.get(LATEST_SNAPSHOT_KEY);
  if (object === null) return null;

  let body: unknown;
  try {
    body = await object.json();
  } catch {
    return null;
  }
  return parseSnapshot(body);
}

function parseSnapshot(value: unknown): MilkSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) return null;

  const season = nonEmptyString(candidate.season);
  const collectedAt = isoDateString(candidate.collectedAt);
  const official = parseOfficial(candidate.official);
  if (season === null || collectedAt === null || official === null) return null;

  let futures: FuturesBlock | undefined;
  if (candidate.futures !== undefined) {
    const parsed = parseFuturesBlock(candidate.futures, season, collectedAt);
    if (parsed === null) return null;
    futures = parsed;
  }

  return { schemaVersion: 1, season, collectedAt, official, futures };
}

function parseFuturesBlock(
  value: unknown,
  season: string,
  collectedAt: string,
): FuturesBlock | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;

  if (candidate.status === "unavailable") {
    const reason = candidate.reason;
    const validReasons: readonly string[] = [
      "no-next-data", "no-mkp-curve", "missing-contract", "wrong-season",
      "expired", "wrong-currency", "crossed", "future-quote",
      "unverifiable", "no-basis", "not-collected",
    ];
    return typeof reason === "string" && validReasons.includes(reason)
      ? { status: "unavailable", reason: reason as FuturesReason }
      : null;
  }
  if (candidate.status !== "ok") return null;

  // The block must re-identify the exact season contract, not any MKP code.
  const contractCode = expectedMkpContract(season);
  if (contractCode === null || candidate.contractCode !== contractCode) return null;
  if (candidate.season !== season) return null;

  const expiry = isoDateString(candidate.expiry);
  const retrievedAt = isoDateString(candidate.retrievedAt);
  const sourceUrl = nonEmptyString(candidate.sourceUrl);
  if (expiry === null || retrievedAt === null || sourceUrl === null) return null;
  const closeYear = parseInt(season.slice(0, 4), 10) + 1;
  if (expiry.slice(0, 7) !== `${closeYear}-09`) return null;
  if (Date.parse(expiry) <= Date.parse(collectedAt)) return null;

  const price = positiveNumber(candidate.price);
  const bid = optionalPositiveNumber(candidate.bid);
  const offer = optionalPositiveNumber(candidate.offer);
  const last = optionalPositiveNumber(candidate.last);
  const priorSettlement = optionalPositiveNumber(candidate.priorSettlement);
  if (price === null || bid === undefined || offer === undefined) return null;
  if (last === undefined || priorSettlement === undefined) return null;

  // A crossed market invalidates the block whatever basis it claims.
  if (bid !== null && offer !== null && bid > offer) return null;

  const basis = candidate.basis;
  const twoSided = bid !== null && offer !== null;
  if (basis === "bid-offer-midpoint") {
    if (!twoSided) return null;
    if (Math.abs(price * 2 - (bid + offer)) > 1e-9) return null;
  } else if (basis === "last-trade") {
    if (twoSided) return null;
    if (last === null) return null;
    if (Math.abs(price - last) > 1e-9) return null;
  } else if (basis === "prior-settlement") {
    if (twoSided) return null;
    if (priorSettlement === null) return null;
    if (Math.abs(price - priorSettlement) > 1e-9) return null;
  } else {
    return null;
  }

  const quotedAt = optionalIsoDateString(candidate.quotedAt);
  const tradedAt = optionalIsoDateString(candidate.tradedAt);
  // undefined = present but invalid; the parser never omits these silently.
  if (quotedAt === undefined || tradedAt === undefined) return null;
  if (quotedAt === null) return null;
  // tradedAt is only ever persisted for the last-trade basis; a settlement
  // or midpoint block carrying one contradicts the fallback priority.
  if (basis === "last-trade" && tradedAt === null) return null;
  if (basis !== "last-trade" && tradedAt !== null) return null;
  const expectedStale = Date.parse(retrievedAt) - Date.parse(quotedAt) > 72 * 3_600_000;
  if (candidate.stale !== expectedStale) return null;

  const tradedVolume = nonNegativeInt(candidate.tradedVolume);
  const bidVolume = nonNegativeInt(candidate.bidVolume);
  const offerVolume = nonNegativeInt(candidate.offerVolume);
  const openInterest = nonNegativeInt(candidate.openInterest);
  if (
    tradedVolume === undefined || bidVolume === undefined ||
    offerVolume === undefined || openInterest === undefined
  ) {
    return null;
  }
  if (typeof candidate.stale !== "boolean") return null;
  if (candidate.currency !== "NZD" || candidate.unit !== "NZD/kgMS") return null;

  return {
    status: "ok",
    contractCode,
    season,
    expiry,
    basis,
    price,
    bid,
    offer,
    last,
    priorSettlement,
    tradedVolume,
    bidVolume,
    offerVolume,
    openInterest,
    stale: candidate.stale,
    currency: "NZD",
    unit: "NZD/kgMS",
    quotedAt,
    tradedAt,
    retrievedAt,
    sourceUrl,
  };
}

function parseOfficial(value: unknown): OfficialForecast | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;

  const midpoint = positiveNumber(candidate.midpoint);
  const low = optionalPositiveNumber(candidate.low);
  const high = optionalPositiveNumber(candidate.high);
  // undefined = present but invalid; null = unpublished endpoint.
  if (midpoint === null || low === undefined || high === undefined) return null;
  // low <= midpoint <= high is contract whenever the endpoints are published.
  if (low !== null && low > midpoint) return null;
  if (high !== null && high < midpoint) return null;

  const rangeSource = candidate.rangeSource;
  if (rangeSource !== "inline" && rangeSource !== "footnote" && rangeSource !== "none") {
    return null;
  }
  if (rangeSource === "none" && (low !== null || high !== null)) return null;
  if (rangeSource !== "none" && (low === null || high === null)) return null;

  const noChangeUpdate = parseNoChangeUpdate(candidate.noChangeUpdate);
  if (noChangeUpdate === undefined) return null;

  const announcedAt = isoDateString(candidate.announcedAt);
  const retrievedAt = isoDateString(candidate.retrievedAt);
  const sourceUrl = nonEmptyString(candidate.sourceUrl);
  if (announcedAt === null || retrievedAt === null || sourceUrl === null) {
    return null;
  }
  if (candidate.currency !== "NZD" || candidate.unit !== "NZD/kgMS") return null;
  if (candidate.status !== "ok") return null;

  return {
    midpoint,
    low,
    high,
    rangeSource,
    announcedAt,
    noChangeUpdate,
    currency: "NZD",
    unit: "NZD/kgMS",
    sourceUrl,
    retrievedAt,
    status: "ok",
  };
}

// undefined = invalid shape; null = no No Change announcement to surface.
function parseNoChangeUpdate(value: unknown): { date: string } | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return undefined;
  const date = isoDateString((value as Record<string, unknown>).date);
  return date === null ? undefined : { date };
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function optionalPositiveNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  const parsed = positiveNumber(value);
  return parsed === null ? undefined : parsed;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// undefined = invalid shape or invalid string; null = legitimately absent.
function optionalIsoDateString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const parsed = isoDateString(value);
  return parsed === null ? undefined : parsed;
}

function nonNegativeInt(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

function isoDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Date.parse normalises impossible dates like 2026-09-31; check the calendar.
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    return null;
  }
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return Number.isNaN(Date.parse(value)) ? null : value;
}
