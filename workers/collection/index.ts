// Scheduled collector: daily at 06:00 UTC it fetches both sources, archives
// each successful result under a timestamped key, then publishes a release
// (immutable snapshot/history objects, conditional manifest, v1 mirror). On
// partial failure the prior valid block is retained with its original
// timestamps.

import {
  currentSeason,
  FONTERA_SOURCE_URL,
  parseAnnouncementHistory,
  parseOfficialForecast,
  type AnnouncementRow,
} from "../../lib/fonterra";
import { NZX_SOURCE_URL, parseFuturesReference } from "../../lib/nzx";
import {
  readLatestSnapshot,
  type FuturesBlock,
  type MilkSnapshot,
  type OfficialForecast,
  type SourceCheck,
} from "../../lib/snapshot";
import { fetchSource } from "./fetch-source";
import {
  cleanupExpiredArchives,
  publishRelease,
  type CollectionBucket,
} from "./publish";
import type { PutCondition } from "../../lib/release";

export type { CollectionBucket } from "./publish";

// Structural subset of the R2 binding (Workers API reference, 2026-09-24):
// conditional put() stores nothing and returns null when the precondition
// fails; get() exposes the etag a later If-Match must carry.
interface R2ObjectLike {
  etag?: string;
  httpEtag?: string;
  key?: string;
}

export interface R2BucketLike {
  get(key: string): Promise<(R2ObjectLike & { json(): Promise<unknown> }) | null>;
  put(key: string, value: string, options?: { onlyIf?: Headers }): Promise<R2ObjectLike | null>;
  list(options?: { prefix?: string }): Promise<{ objects: R2ObjectLike[] }>;
  delete(key: string): Promise<void>;
}

export interface CollectorEnv {
  SNAPSHOTS: R2BucketLike;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

interface ScheduledContext {
  waitUntil(promise: Promise<unknown>): void;
}

const collector = {
  async scheduled(
    controller: ScheduledController,
    env: CollectorEnv,
    ctx: ScheduledContext,
    deps?: { fetch?: typeof fetch },
  ): Promise<void> {
    ctx.waitUntil(collect(controller, adaptBucket(env.SNAPSHOTS), deps?.fetch));
  },
};

// PutCondition → R2 onlyIf headers: If-Match for update-only-when-unchanged,
// If-None-Match:* for create-only. The binding's null (nothing stored) on
// precondition failure maps to false.
function conditionHeaders(condition: PutCondition): Headers {
  return "ifNoneMatchAny" in condition
    ? new Headers({ "if-none-match": "*" })
    : new Headers({ "if-match": condition.ifMatch });
}
function adaptBucket(raw: R2BucketLike): CollectionBucket {
  return {
    async get(key) {
      const object = await raw.get(key);
      if (object === null) return null;
      return {
        etag: object.httpEtag ?? object.etag ?? null,
        json: () => object.json(),
      };
    },
    async put(key, value, condition) {
      const options =
        condition === undefined ? undefined : { onlyIf: conditionHeaders(condition) };
      return (await raw.put(key, value, options)) !== null;
    },
    async list(prefix) {
      const page = await raw.list({ prefix });
      return page.objects.map((object) => object.key ?? "").filter((key) => key !== "");
    },
    async delete(key) {
      await raw.delete(key);
    },
  };
}

async function collect(
  controller: ScheduledController,
  bucket: CollectionBucket,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const started = Date.now();
  const now = new Date(controller.scheduledTime);
  const season = currentSeason(now);
  log("collector.run.started", {
    cron: controller.cron,
    season,
    at: isoInstant(now.getTime()),
  });

  const prior = await readLatestSnapshot(bucket);
  // Data from a previous season must never roll over into the new one.
  const priorForSeason = prior !== null && prior.season === season ? prior : null;

  const [officialFetch, futuresFetch] = await Promise.all([
    fetchSource(FONTERA_SOURCE_URL, { fetch: fetchImpl }),
    fetchSource(NZX_SOURCE_URL, { fetch: fetchImpl }),
  ]);

  let official: OfficialForecast | null = priorForSeason?.official ?? null;
  let officialOutcome: string;
  let announcementRows: AnnouncementRow[] = [];
  if (officialFetch.ok) {
    const parsed = parseOfficialForecast(officialFetch.body, now);
    if (parsed.status === "ok") {
      official = {
        midpoint: parsed.midpoint,
        low: parsed.low,
        high: parsed.high,
        rangeSource: parsed.rangeSource,
        announcedAt: parsed.announcedAt,
        noChangeUpdate: parsed.noChangeUpdate,
        currency: "NZD",
        unit: "NZD/kgMS",
        sourceUrl: parsed.sourceUrl,
        retrievedAt: isoInstant(now.getTime()),
        status: "ok",
      };
      await archive(bucket, "official", now, official);
      officialOutcome = "ok";
      const history = parseAnnouncementHistory(officialFetch.body);
      announcementRows =
        history.status === "ok"
          ? (history.seasons.find((s) => s.season === season)?.announcements ?? [])
          : [];
    } else {
      officialOutcome = `unavailable:${parsed.reason}`;
    }
  } else {
    officialOutcome = `fetch-failed:${officialFetch.detail}`;
  }
  log("collector.source.checked", { source: "official", outcome: officialOutcome });

  let futures: FuturesBlock =
    priorForSeason?.futures?.status === "ok"
      ? priorForSeason.futures
      : { status: "unavailable", reason: "not-collected" };
  let futuresOutcome: string;
  if (futuresFetch.ok) {
    const parsedBlock = parseFuturesReference(futuresFetch.body, now, season);
    if (parsedBlock.status === "ok") {
      await archive(bucket, "futures", now, parsedBlock);
      futures = parsedBlock;
      futuresOutcome = "ok";
    } else {
      futuresOutcome = `unavailable:${parsedBlock.reason}`;
      // Keep the prior ok reference; only replace a placeholder.
      if (futures.status !== "ok") futures = parsedBlock;
    }
  } else {
    futuresOutcome = `fetch-failed:${futuresFetch.detail}`;
  }
  log("collector.source.checked", { source: "futures", outcome: futuresOutcome });

  if (official === null) {
    // Nothing valid to publish; the previous snapshot stays in place.
    log("collector.publish.skipped", {
      season,
      reason: "no-valid-official",
      priorSeason: prior?.season ?? null,
    });
    return;
  }

  const checkedAt = isoInstant(now.getTime());
  const snapshot: MilkSnapshot = {
    schemaVersion: 1,
    season,
    collectedAt: checkedAt,
    official,
    futures,
    checks: {
      official: officialCheck(officialOutcome, checkedAt),
      futures: futuresCheck(futuresOutcome, futures, checkedAt),
    },
  };

  const outcome = await publishRelease(bucket, {
    season,
    runId: runIdFromInstant(now.getTime()),
    collectedAt: checkedAt,
    snapshot,
    announcementRows,
    futures,
  });
  if (outcome.status === "published") {
    log("collector.publish.succeeded", {
      season,
      runId: outcome.manifest.runId,
      durationMs: Date.now() - started,
      officialRetained: officialOutcome !== "ok",
      futuresRetained: futuresOutcome !== "ok",
      mirrorUpdated: outcome.mirrorUpdated,
    });
  } else {
    log(`collector.publish.${outcome.status === "failed" ? "failed" : "skipped"}`, {
      season,
      reason: outcome.reason,
    });
  }

  await cleanupExpiredArchives(bucket, now.getTime());
}

// Retries reuse the run ID: the same scheduled instant always maps to the
// same key, so a retry rewrites identical content instead of forking it.
function runIdFromInstant(epochMs: number): string {
  const iso = new Date(epochMs).toISOString();
  return `${iso.slice(0, 10).replace(/-/g, "")}-${iso.slice(11, 19).replace(/:/g, "")}`;
}

// A published snapshot always carries a valid official value, so its failed
// check is always a retention; "unavailable" is unreachable for the official.
function officialCheck(outcome: string, checkedAt: string): SourceCheck {
  return outcome === "ok"
    ? { source: "official", checkedAt, outcome: "ok", detail: null }
    : { source: "official", checkedAt, outcome: "retained", detail: outcome };
}

function futuresCheck(
  outcome: string,
  futures: FuturesBlock,
  checkedAt: string,
): SourceCheck {
  if (outcome === "ok") {
    return { source: "futures", checkedAt, outcome: "ok", detail: null };
  }
  // An ok block after a failed check is the retained prior reference.
  return futures.status === "ok"
    ? { source: "futures", checkedAt, outcome: "retained", detail: outcome }
    : { source: "futures", checkedAt, outcome: "unavailable", detail: outcome };
}

async function archive(
  bucket: CollectionBucket,
  source: string,
  now: Date,
  payload: unknown,
): Promise<void> {
  const key = `archive/${source}/${isoInstant(now.getTime())}.json`;
  await bucket.put(key, JSON.stringify(payload));
  log("collector.archive.written", { source, key });
}

function isoInstant(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(".000Z", "Z");
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}

export default collector;
