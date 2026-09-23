// Release publication and reading contracts for the next release. The legacy
// latest.json v1 path is untouched; releases add immutable per-run objects, a
// small manifest, and a separate optional context object.

import { parseSeasonHistory, type SeasonHistory } from "./history";
import { parseSnapshot, type MilkSnapshot } from "./snapshot";

export const CURRENT_RELEASE_KEY = "current-release.json";
export const CURRENT_CONTEXT_KEY = "current-context.json";

export const CONTEXT_MAX_CARDS = 8;

export type ReleaseProvenance = "fixture" | "collected";
export type ReadProvenance = ReleaseProvenance | "unknown";

export interface ReleaseDescriptor {
  runId: string;
  collectedAt: string;
  snapshotKey: string;
  historyKey: string | null;
}

export interface ReleaseManifest {
  schemaVersion: 1;
  season: string;
  provenance: ReleaseProvenance;
  runId: string;
  updatedAt: string;
  current: ReleaseDescriptor;
  previous: ReleaseDescriptor | null;
}

export type ReleaseRead =
  | {
      kind: "release";
      manifest: ReleaseManifest;
      snapshot: MilkSnapshot;
      history: SeasonHistory | null;
      provenance: ReleaseProvenance;
    }
  | { kind: "legacy"; snapshot: MilkSnapshot | null; provenance: "unknown" };

// Verified against the R2 Workers API reference (2026-09-24): put() with an
// onlyIf precondition returns null instead of storing on failure, and get()
// exposes the etag a conditional update must match. The storage interface
// mirrors those semantics so the fake used in tests cannot drift.
export type PutCondition = { ifMatch: string } | { ifNoneMatchAny: true };

export interface ReleaseStoredObject {
  etag: string | null;
  json(): Promise<unknown>;
}

export interface ReleaseStorage {
  get(key: string): Promise<ReleaseStoredObject | null>;
  put(key: string, value: string, condition?: PutCondition): Promise<boolean>;
}

// The web tier binds a read-only bucket; only the collector can write.
export type ReleaseReader = Pick<ReleaseStorage, "get">;

export function releaseKeys(
  season: string,
  runId: string,
): { snapshotKey: string; historyKey: string } {
  return {
    snapshotKey: `releases/${season}/${runId}/snapshot.json`,
    historyKey: `releases/${season}/${runId}/history.json`,
  };
}

const RUN_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

function parseDescriptor(
  value: unknown,
  season: string,
  runId: string,
): ReleaseDescriptor | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.runId !== runId) return null;
  if (typeof candidate.collectedAt !== "string" || isoInstant(candidate.collectedAt) === null) {
    return null;
  }
  const { snapshotKey, historyKey } = releaseKeys(season, runId);
  if (candidate.snapshotKey !== snapshotKey) return null;
  if (candidate.historyKey !== historyKey && candidate.historyKey !== null) return null;
  return { runId, collectedAt: candidate.collectedAt, snapshotKey, historyKey: candidate.historyKey as string | null };
}

export function parseReleaseManifest(value: unknown): ReleaseManifest | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) return null;
  if (typeof candidate.season !== "string" || candidate.season === "") return null;
  if (candidate.provenance !== "fixture" && candidate.provenance !== "collected") {
    return null;
  }
  if (typeof candidate.runId !== "string" || !RUN_ID_PATTERN.test(candidate.runId)) {
    return null;
  }
  if (typeof candidate.updatedAt !== "string" || isoInstant(candidate.updatedAt) === null) {
    return null;
  }

  const current = parseDescriptor(candidate.current, candidate.season, candidate.runId);
  if (current === null) return null;

  let previous: ReleaseDescriptor | null = null;
  if (candidate.previous !== null && candidate.previous !== undefined) {
    if (typeof candidate.previous !== "object") return null;
    const previousCandidate = candidate.previous as Record<string, unknown>;
    if (typeof previousCandidate.runId !== "string" || !RUN_ID_PATTERN.test(previousCandidate.runId)) {
      return null;
    }
    if (previousCandidate.runId === candidate.runId) return null;
    previous = parseDescriptor(previousCandidate, candidate.season, previousCandidate.runId);
    if (previous === null) return null;
  }

  return {
    schemaVersion: 1,
    season: candidate.season,
    provenance: candidate.provenance,
    runId: candidate.runId,
    updatedAt: candidate.updatedAt,
    current,
    previous,
  };
}

// The fallback ladder from the plan, in order, with bounded reads (at most
// manifest + current snapshot + history + previous snapshot + previous
// history; the page never scans keys):
//   no valid manifest          -> legacy snapshot, no history
//   valid snapshot, bad history-> keep the snapshot, history unavailable
//   invalid snapshot           -> previous release, then legacy, no history
export async function readRelease(storage: ReleaseReader): Promise<ReleaseRead> {
  const manifestObject = await readJson(storage, CURRENT_RELEASE_KEY);
  const manifest = manifestObject === null ? null : parseReleaseManifest(manifestObject);
  if (manifest === null) {
    return legacyRead(storage);
  }

  const currentSnapshot = await readSnapshot(storage, manifest.current.snapshotKey);
  if (currentSnapshot !== null && currentSnapshot.season === manifest.season) {
    const history = await readHistoryFor(storage, manifest.current.historyKey, manifest.season);
    return {
      kind: "release",
      manifest,
      snapshot: currentSnapshot,
      history,
      provenance: manifest.provenance,
    };
  }

  if (manifest.previous !== null) {
    const previousSnapshot = await readSnapshot(storage, manifest.previous.snapshotKey);
    if (previousSnapshot !== null && previousSnapshot.season === manifest.season) {
      const history = await readHistoryFor(storage, manifest.previous.historyKey, manifest.season);
      return {
        kind: "release",
        manifest,
        snapshot: previousSnapshot,
        history,
        provenance: manifest.provenance,
      };
    }
  }

  return legacyRead(storage);
}

// A conditional put primitive for the manifest update: create-only when there
// is no prior object, update-only-when-unchanged otherwise. A false return
// means a competing run won the race; the caller re-reads and rebuilds.
export async function conditionalPut(
  storage: ReleaseStorage,
  key: string,
  value: string,
  priorEtag: string | null,
): Promise<boolean> {
  return storage.put(
    key,
    value,
    priorEtag === null ? { ifNoneMatchAny: true } : { ifMatch: priorEtag },
  );
}

async function readJson(storage: ReleaseReader, key: string): Promise<unknown | null> {
  try {
    const object = await storage.get(key);
    if (object === null) return null;
    return await object.json();
  } catch {
    return null;
  }
}

async function readSnapshot(storage: ReleaseReader, key: string): Promise<MilkSnapshot | null> {
  const value = await readJson(storage, key);
  return value === null ? null : parseSnapshot(value);
}

async function readHistoryFor(
  storage: ReleaseReader,
  key: string | null,
  season: string,
): Promise<SeasonHistory | null> {
  if (key === null) return null;
  const value = await readJson(storage, key);
  return value === null ? null : parseSeasonHistory(value, season);
}

async function legacyRead(storage: ReleaseReader): Promise<ReleaseRead> {
  const snapshot = await readSnapshot(storage, "latest.json");
  return { kind: "legacy", snapshot, provenance: "unknown" };
}

export interface ContextCheck {
  checkedAt: string;
  outcome: "ok" | "retained" | "unavailable";
  detail: string | null;
}

export interface ContextCard {
  id: string;
  source: string;
  sourceUrl: string;
  period: string;
  value: number;
  unit: string;
  currency: string | null;
  observedAt: string;
  nextExpectedAt: string | null;
  graceMs: number | null;
  check: ContextCheck;
  change: { fromValue: number; fromAt: string } | null;
}

export interface ContextObject {
  schemaVersion: 1;
  season: string;
  generatedAt: string;
  cards: ContextCard[];
}

// Each card is validated independently; a bad card is dropped without
// invalidating its neighbours, and failure of the whole object never blocks
// core publication.
export function parseContextCard(value: unknown): ContextCard | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || c.id === "") return null;
  if (typeof c.source !== "string" || c.source === "") return null;
  if (typeof c.sourceUrl !== "string" || !/^https:\/\//.test(c.sourceUrl)) return null;
  if (typeof c.period !== "string" || c.period === "") return null;
  if (typeof c.value !== "number" || !Number.isFinite(c.value) || c.value <= 0) return null;
  if (typeof c.unit !== "string" || c.unit === "") return null;
  if (c.currency !== null && typeof c.currency !== "string") return null;
  if (typeof c.observedAt !== "string" || isoInstant(c.observedAt) === null) return null;
  if (c.nextExpectedAt !== null &&
    (typeof c.nextExpectedAt !== "string" || isoInstant(c.nextExpectedAt) === null)) {
    return null;
  }
  if (c.graceMs !== null &&
    !(typeof c.graceMs === "number" && Number.isInteger(c.graceMs) && c.graceMs > 0)) {
    return null;
  }

  if (typeof c.check !== "object" || c.check === null) return null;
  const check = c.check as Record<string, unknown>;
  if (typeof check.checkedAt !== "string" || isoInstant(check.checkedAt) === null) return null;
  if (check.outcome !== "ok" && check.outcome !== "retained" && check.outcome !== "unavailable") {
    return null;
  }
  if (check.outcome === "ok" ? check.detail !== null : typeof check.detail !== "string" || check.detail === "") {
    return null;
  }

  let change: ContextCard["change"] = null;
  if (c.change !== null && c.change !== undefined) {
    if (typeof c.change !== "object") return null;
    const changeCandidate = c.change as Record<string, unknown>;
    if (typeof changeCandidate.fromValue !== "number" ||
      !Number.isFinite(changeCandidate.fromValue) || changeCandidate.fromValue <= 0) {
      return null;
    }
    if (typeof changeCandidate.fromAt !== "string" || isoInstant(changeCandidate.fromAt) === null) {
      return null;
    }
    change = {
      fromValue: changeCandidate.fromValue,
      fromAt: changeCandidate.fromAt,
    };
  }

  return {
    id: c.id,
    source: c.source,
    sourceUrl: c.sourceUrl,
    period: c.period,
    value: c.value,
    unit: c.unit,
    currency: c.currency as string | null,
    observedAt: c.observedAt,
    nextExpectedAt: c.nextExpectedAt as string | null,
    graceMs: c.graceMs as number | null,
    check: {
      checkedAt: check.checkedAt,
      outcome: check.outcome,
      detail: check.detail as string | null,
    },
    change,
  };
}

export async function readContext(storage: ReleaseStorage): Promise<ContextObject | null> {
  const value = await readJson(storage, CURRENT_CONTEXT_KEY);
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) return null;
  if (typeof candidate.season !== "string" || candidate.season === "") return null;
  if (typeof candidate.generatedAt !== "string" || isoInstant(candidate.generatedAt) === null) {
    return null;
  }
  if (!Array.isArray(candidate.cards) || candidate.cards.length > CONTEXT_MAX_CARDS) return null;

  const cards = candidate.cards
    .map(parseContextCard)
    .filter((card): card is ContextCard => card !== null);
  if (cards.length === 0) return null;
  return { schemaVersion: 1, season: candidate.season, generatedAt: candidate.generatedAt, cards };
}

// Freshness for context cards is overdue publication plus the check outcome —
// never the futures 72-hour rule. "Up to date" claims require both a schedule
// and a grace interval; otherwise the schedule is unknown.
export type ContextFreshness = {
  schedule: "known" | "unknown";
  overdue: boolean;
};

export function contextCardFreshness(card: ContextCard, nowMs: number): ContextFreshness {
  if (card.nextExpectedAt === null || card.graceMs === null) {
    return { schedule: "unknown", overdue: false };
  }
  const dueMs = Date.parse(card.nextExpectedAt) + card.graceMs;
  return { schedule: "known", overdue: nowMs > dueMs };
}

function isoInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return null;
  }
  return Number.isNaN(Date.parse(value)) ? null : value;
}
