export const LATEST_SNAPSHOT_KEY = "latest.json";

export type RangeSource = "inline" | "footnote" | "none";

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

  return { schemaVersion: 1, season, collectedAt, official };
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

function isoDateString(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return value;
}
