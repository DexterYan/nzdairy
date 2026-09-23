// Scheduled collector: daily at 06:00 UTC it fetches both sources, archives
// each successful result under a timestamped key, then publishes the combined
// latest snapshot. On partial failure the prior valid block is retained with
// its original timestamps.

import {
  currentSeason,
  FONTERA_SOURCE_URL,
  parseOfficialForecast,
} from "../../lib/fonterra";
import { NZX_SOURCE_URL, parseFuturesReference } from "../../lib/nzx";
import {
  LATEST_SNAPSHOT_KEY,
  readLatestSnapshot,
  type FuturesBlock,
  type MilkSnapshot,
  type OfficialForecast,
  type SnapshotObject,
} from "../../lib/snapshot";
import { fetchSource } from "./fetch-source";

export interface CollectorEnv {
  SNAPSHOTS: CollectionBucket;
}

export interface CollectionBucket {
  get(key: string): Promise<SnapshotObject | null>;
  put(key: string, value: string): Promise<unknown>;
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
    ctx.waitUntil(collect(controller, env, deps?.fetch));
  },
};

async function collect(
  controller: ScheduledController,
  env: CollectorEnv,
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

  const prior = await readLatestSnapshot(env.SNAPSHOTS);
  // Data from a previous season must never roll over into the new one.
  const priorForSeason = prior !== null && prior.season === season ? prior : null;

  const [officialFetch, futuresFetch] = await Promise.all([
    fetchSource(FONTERA_SOURCE_URL, { fetch: fetchImpl }),
    fetchSource(NZX_SOURCE_URL, { fetch: fetchImpl }),
  ]);

  let official: OfficialForecast | null = priorForSeason?.official ?? null;
  let officialOutcome: string;
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
      await archive(env.SNAPSHOTS, "official", now, official);
      officialOutcome = "ok";
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
      await archive(env.SNAPSHOTS, "futures", now, parsedBlock);
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

  const snapshot: MilkSnapshot = {
    schemaVersion: 1,
    season,
    collectedAt: isoInstant(now.getTime()),
    official,
    futures,
  };
  await env.SNAPSHOTS.put(LATEST_SNAPSHOT_KEY, JSON.stringify(snapshot));
  log("collector.publish.succeeded", {
    season,
    durationMs: Date.now() - started,
    officialRetained: officialOutcome !== "ok",
    futuresRetained: futuresOutcome !== "ok",
  });
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
