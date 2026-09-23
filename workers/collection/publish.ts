// Release publication (Task 15b): immutable per-run snapshot/history objects,
// then a conditional manifest update, then the legacy latest.json mirror — in
// that order, so an old reader never sees a manifest without its objects or a
// mirror without a committed manifest. Docs: next-release-plan.md.

import type { AnnouncementRow } from "../../lib/fonterra";
import {
  mergeObservation,
  observationFromFuturesBlock,
  parseSeasonHistory,
  type Observation,
  type SeasonHistory,
} from "../../lib/history";
import {
  conditionalPut,
  CURRENT_RELEASE_KEY,
  parseReleaseManifest,
  releaseKeys,
  type PutCondition,
  type ReleaseManifest,
} from "../../lib/release";
import {
  LATEST_SNAPSHOT_KEY,
  type FuturesBlock,
  type MilkSnapshot,
  type SnapshotObject,
} from "../../lib/snapshot";

export const OFFICIAL_PARSER_VERSION = "fonterra-1";
export const FUTURES_PARSER_VERSION = "nzx-1";

const MANIFEST_ATTEMPTS = 3;
const MIRROR_ATTEMPTS = 2;

// Condition-native storage surface the collector code targets; the R2 binding
// adapter in index.ts translates to onlyIf headers.
export interface CollectionBucket {
  get(key: string): Promise<(SnapshotObject & { etag: string | null }) | null>;
  put(key: string, value: string, condition?: PutCondition): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export interface PublishInput {
  season: string;
  runId: string;
  collectedAt: string;
  snapshot: MilkSnapshot;
  announcementRows: AnnouncementRow[];
  futures: FuturesBlock;
}

export type PublishOutcome =
  | { status: "published"; manifest: ReleaseManifest; mirrorUpdated: boolean }
  | { status: "skipped"; reason: "older-run" }
  | { status: "failed"; reason: "manifest-conflict" };

export async function publishRelease(
  bucket: CollectionBucket,
  input: PublishInput,
): Promise<PublishOutcome> {
  let priorEtag: string | null;
  let prior: ReleaseManifest | null;
  ({ etag: priorEtag, manifest: prior } = await readManifest(bucket));
  if (prior !== null && newer(prior.updatedAt, input.collectedAt)) {
    return { status: "skipped", reason: "older-run" };
  }

  for (let attempt = 1; ; attempt += 1) {
    const history = await buildHistory(bucket, prior, input);
    const { snapshotKey, historyKey } = releaseKeys(input.season, input.runId);
    await bucket.put(snapshotKey, JSON.stringify(input.snapshot));
    await bucket.put(historyKey, JSON.stringify(history));
    log("collector.publish.release-written", {
      season: input.season,
      runId: input.runId,
      snapshotKey,
      historyKey,
      entries: history.entries.length,
    });

    const manifest = manifestFor(input, snapshotKey, historyKey, prior);
    const committed = await conditionalPut(
      bucket,
      CURRENT_RELEASE_KEY,
      JSON.stringify(manifest),
      priorEtag,
    );
    if (committed) {
      const mirrorUpdated = await writeMirror(bucket, input.snapshot);
      log("collector.publish.manifest-updated", {
        season: manifest.season,
        runId: manifest.runId,
        previousRunId: manifest.previous?.runId ?? null,
      });
      return { status: "published", manifest, mirrorUpdated };
    }

    // Another run won the manifest; rebuild from what it committed rather
    // than losing its data. A winner newer than us ends this run instead.
    const reread = await readManifest(bucket);
    if (reread.manifest !== null && newer(reread.manifest.updatedAt, input.collectedAt)) {
      return { status: "skipped", reason: "older-run" };
    }
    if (attempt >= MANIFEST_ATTEMPTS) {
      return { status: "failed", reason: "manifest-conflict" };
    }
    priorEtag = reread.etag;
    prior = reread.manifest;
  }
}

// previous = the prior same-season release; a same-runId retry keeps the
// previous it already had instead of pointing at itself; a new season starts
// with none so no prior-season key can leak into the manifest.
function manifestFor(
  input: PublishInput,
  snapshotKey: string,
  historyKey: string,
  prior: ReleaseManifest | null,
): ReleaseManifest {
  const previous =
    prior === null || prior.season !== input.season
      ? null
      : prior.runId === input.runId
        ? prior.previous
        : prior.current;
  return {
    schemaVersion: 1,
    season: input.season,
    provenance: "collected",
    runId: input.runId,
    updatedAt: input.collectedAt,
    current: {
      runId: input.runId,
      collectedAt: input.collectedAt,
      snapshotKey,
      historyKey,
    },
    previous,
  };
}

// The committed history is the baseline; today's page rows and futures block
// merge into it (identical refetches are duplicates and change nothing). A
// committed history that no longer parses restarts from empty — the page's
// own dated announcements re-materialise it honestly.
async function buildHistory(
  bucket: CollectionBucket,
  prior: ReleaseManifest | null,
  input: PublishInput,
): Promise<SeasonHistory> {
  let history: SeasonHistory = {
    schemaVersion: 1,
    season: input.season,
    materialisedAt: input.collectedAt,
    entries: [],
  };
  if (prior !== null && prior.season === input.season && prior.current.historyKey !== null) {
    const value = await readJson(bucket, prior.current.historyKey);
    const committed = value === null ? null : parseSeasonHistory(value, input.season);
    if (committed !== null) history = committed;
  }
  for (const row of input.announcementRows) {
    history = mergeObservation(
      history,
      announcementObservation(row, input.season, input.collectedAt),
    ).history;
  }
  const futuresObservation = observationFromFuturesBlock(input.futures, FUTURES_PARSER_VERSION);
  if (futuresObservation !== null) {
    history = mergeObservation(history, futuresObservation).history;
  }
  return { ...history, materialisedAt: input.collectedAt };
}

function announcementObservation(
  row: AnnouncementRow,
  season: string,
  firstSeenAt: string,
): Observation {
  return {
    series: "official-forecast",
    provider: "fonterra",
    market: season,
    basis: "announcement",
    effective: { kind: "date", on: row.date },
    payload: {
      value: row.midpoint,
      low: row.low,
      high: row.high,
      currency: "NZD",
      unit: "NZD/kgMS",
    },
    publishedAt: null,
    firstSeenAt,
    parserVersion: OFFICIAL_PARSER_VERSION,
  };
}

// Best-effort mirror: a failure is logged and retried once, never fatal — old
// readers lag but keep their last valid v1 snapshot.
async function writeMirror(bucket: CollectionBucket, snapshot: MilkSnapshot): Promise<boolean> {
  const value = JSON.stringify(snapshot);
  for (let attempt = 1; attempt <= MIRROR_ATTEMPTS; attempt += 1) {
    try {
      await bucket.put(LATEST_SNAPSHOT_KEY, value);
      return true;
    } catch (error) {
      log("collector.publish.mirror-failed", { attempt, error: String(error) });
    }
  }
  return false;
}

async function readManifest(
  bucket: CollectionBucket,
): Promise<{ etag: string | null; manifest: ReleaseManifest | null }> {
  let object: Awaited<ReturnType<CollectionBucket["get"]>> = null;
  try {
    object = await bucket.get(CURRENT_RELEASE_KEY);
  } catch {
    return { etag: null, manifest: null };
  }
  if (object === null) return { etag: null, manifest: null };
  // The etag is kept even when the body is corrupt: the replacement write
  // must still be conditional on the object we actually read.
  let manifest: ReleaseManifest | null = null;
  try {
    manifest = parseReleaseManifest(await object.json());
  } catch {
    manifest = null;
  }
  return { etag: object.etag, manifest };
}

async function readJson(bucket: CollectionBucket, key: string): Promise<unknown | null> {
  try {
    const object = await bucket.get(key);
    if (object === null) return null;
    return await object.json();
  } catch {
    return null;
  }
}

function newer(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b);
}

// Parsed-provenance archives are kept for 400 days (a season plus buffer);
// raw HTML is not retained — replay limits are recorded in docs/operations.md.
export const ARCHIVE_RETENTION_MS = 400 * 24 * 3_600_000;
const CLEANUP_MAX_DELETES = 100;

export async function cleanupExpiredArchives(
  bucket: CollectionBucket,
  nowMs: number,
): Promise<number> {
  const cutoff = nowMs - ARCHIVE_RETENTION_MS;
  let keys: string[];
  try {
    keys = await bucket.list("archive/");
  } catch {
    return 0;
  }
  // Keys sort oldest-instant-first, so a bounded delete converges over runs.
  const expired = keys
    .filter((key) => {
      const file = key.slice(key.lastIndexOf("/") + 1);
      const instant = Date.parse(file.replace(/\.json$/, ""));
      return !Number.isNaN(instant) && instant < cutoff;
    })
    .slice(0, CLEANUP_MAX_DELETES);
  for (const key of expired) {
    await bucket.delete(key).catch(() => {});
  }
  log("collector.archive.cleanup", {
    scanned: keys.length,
    deleted: expired.length,
    retentionDays: Math.round(ARCHIVE_RETENTION_MS / 86_400_000),
  });
  return expired.length;
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}
