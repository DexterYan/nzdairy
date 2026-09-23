import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import latestSnapshot from "../fixtures/latest-snapshot.json";
import { parseSeasonHistory } from "../lib/history";
import { CURRENT_RELEASE_KEY, parseReleaseManifest } from "../lib/release";
import type { MilkSnapshot } from "../lib/snapshot";
import collector, { type CollectorEnv, type R2BucketLike } from "../workers/collection";

const SCHEDULED_AT = Date.parse("2026-09-23T06:00:00Z");

function fixture(dir: "fonterra" | "nzx", name: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", dir, name), "utf8");
}

// Fake of the R2 binding's documented semantics (Workers API reference,
// 2026-09-24): a conditional put() whose precondition fails stores nothing
// and returns null; etags identify stored versions.
function fakeR2(initial: Record<string, string> = {}): R2BucketLike & {
  store: Map<string, string>;
  putOrder: string[];
  failKeys: Set<string>;
  failOnceKeys: Set<string>;
  onPut: ((key: string, value: string) => void) | null;
  set(key: string, value: string): void;
} {
  const store = new Map(Object.entries(initial));
  let counter = 0;
  const nextEtag = () => `"e${(counter += 1)}"`;
  const etags = new Map<string, string>([...store.keys()].map((key) => [key, nextEtag()]));
  const putOrder: string[] = [];
  const failKeys = new Set<string>();
  const failOnceKeys = new Set<string>();
  let hook: ((key: string, value: string) => void) | null = null;

  return {
    store,
    putOrder,
    failKeys,
    failOnceKeys,
    get onPut() {
      return hook;
    },
    set onPut(value: ((key: string, value: string) => void) | null) {
      hook = value;
    },
    set(key: string, value: string) {
      etags.set(key, nextEtag());
      store.set(key, value);
    },
    async get(key: string) {
      const value = store.get(key);
      if (value === undefined) return null;
      const etag = etags.get(key) ?? nextEtag();
      etags.set(key, etag);
      return { etag, httpEtag: etag, json: async () => JSON.parse(value) };
    },
    async put(key: string, value: string, options?: { onlyIf?: Headers }) {
      putOrder.push(key);
      hook?.(key, value);
      if (failKeys.has(key) || failOnceKeys.has(key)) {
        failOnceKeys.delete(key);
        throw new Error(`injected put failure: ${key}`);
      }
      const onlyIf = options?.onlyIf;
      if (onlyIf instanceof Headers) {
        const current = etags.get(key);
        const ifMatch = onlyIf.get("if-match");
        if (ifMatch !== null && current !== ifMatch) return null;
        if (onlyIf.get("if-none-match") === "*" && current !== undefined) return null;
      }
      const etag = nextEtag();
      etags.set(key, etag);
      store.set(key, value);
      return { etag, httpEtag: etag };
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? "";
      return { objects: [...store.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    async delete(key: string) {
      store.delete(key);
      etags.delete(key);
    },
  };
}

function fakeCtx() {
  const deferred: Promise<unknown>[] = [];
  return {
    waitUntil(promise: Promise<unknown>) {
      deferred.push(promise);
    },
    async done() {
      await Promise.all(deferred);
    },
  };
}

function envWith(bucket: R2BucketLike): CollectorEnv {
  return { SNAPSHOTS: bucket };
}

function fetchMock(byUrl: Record<string, Response>): typeof fetch {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const response = byUrl[url];
    if (!response) throw new Error(`unexpected fetch of ${url}`);
    return Promise.resolve(response.clone());
  }) as unknown as typeof fetch;
}

const FONTERA_URL =
  "https://www.fonterra.com/nz/en/investors/financial-reports-and-farmgate-milk-price.html";
const NZX_URL =
  "https://www.nzx.com/markets/nzx-dairy-derivatives/quotes/futures/MKP";

function healthyFetch(): Record<string, Response> {
  return {
    [FONTERA_URL]: new Response(fixture("fonterra", "page-2026-09.html")),
    [NZX_URL]: new Response(fixture("nzx", "page-2026-09.html")),
  };
}

async function runScheduled(
  env: CollectorEnv,
  byUrl?: Record<string, Response>,
  scheduledTime: number = SCHEDULED_AT,
): Promise<ReturnType<typeof fakeCtx>> {
  const ctx = fakeCtx();
  await collector.scheduled(
    { scheduledTime, cron: "0 6 * * *" },
    env,
    ctx,
    byUrl ? { fetch: fetchMock(byUrl) } : undefined,
  );
  await ctx.done();
  return ctx;
}

function storedManifest(bucket: ReturnType<typeof fakeR2>) {
  const raw = bucket.store.get(CURRENT_RELEASE_KEY);
  return raw === undefined ? null : parseReleaseManifest(JSON.parse(raw));
}

function storedHistory(bucket: ReturnType<typeof fakeR2>, key: string) {
  const raw = bucket.store.get(key);
  return raw === undefined ? null : parseSeasonHistory(JSON.parse(raw), "2026/27");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collector scheduled run", () => {
  it("archives both sources and publishes a valid snapshot on a healthy run", async () => {
    const bucket = fakeR2();
    await runScheduled(envWith(bucket), healthyFetch());

    const keys = [...bucket.store.keys()];
    expect(keys.some((key) => key.startsWith("archive/official/"))).toBe(true);
    expect(keys.some((key) => key.startsWith("archive/futures/"))).toBe(true);
    expect(keys).toContain("latest.json");
    // Archives precede the published latest snapshot.
    const latestIndex = bucket.putOrder.indexOf("latest.json");
    expect(bucket.putOrder.some((key) => key.startsWith("archive/official/"))).toBe(true);
    expect(bucket.putOrder.findIndex((key) => key.startsWith("archive/"))).toBeLessThan(latestIndex);

    const archiveKey = keys.find((key) => key.startsWith("archive/futures/")) as string;
    expect(JSON.parse(bucket.store.get(archiveKey) as string)).toEqual({
      ...latestSnapshot.futures,
      retrievedAt: "2026-09-23T06:00:00Z",
    });

    const snapshot = await bucket.get("latest.json").then((o) => o?.json());
    expect(snapshot).toEqual({
      schemaVersion: 1,
      season: "2026/27",
      collectedAt: "2026-09-23T06:00:00Z",
      official: {
        ...latestSnapshot.official,
        retrievedAt: "2026-09-23T06:00:00Z",
      },
      futures: {
        ...latestSnapshot.futures,
        retrievedAt: "2026-09-23T06:00:00Z",
      },
      checks: {
        official: {
          source: "official",
          checkedAt: "2026-09-23T06:00:00Z",
          outcome: "ok",
          detail: null,
        },
        futures: {
          source: "futures",
          checkedAt: "2026-09-23T06:00:00Z",
          outcome: "ok",
          detail: null,
        },
      },
    });
  });

  it("retains the prior official forecast with its original timestamp when the fetch fails", async () => {
    const bucket = fakeR2({ "latest.json": JSON.stringify(latestSnapshot) });
    await runScheduled(envWith(bucket), {
      [FONTERA_URL]: new Response("gateway gone", { status: 503 }),
      [NZX_URL]: new Response(fixture("nzx", "page-2026-09.html")),
    });

    const snapshot = (await bucket.get("latest.json")?.then((o) => o?.json())) as MilkSnapshot;
    expect(snapshot.official).toEqual(latestSnapshot.official);
    expect(
      snapshot.futures?.status === "ok" ? snapshot.futures.retrievedAt : null,
    ).toBe("2026-09-23T06:00:00Z");
    expect(snapshot.checks?.official).toEqual({
      source: "official",
      checkedAt: "2026-09-23T06:00:00Z",
      outcome: "retained",
      detail: "fetch-failed:status 503",
    });
    expect(snapshot.checks?.futures?.outcome).toBe("ok");
    // The failed source is not archived.
    expect([...bucket.store.keys()].some((key) => key.startsWith("archive/official/"))).toBe(false);
  });

  it("retains the prior futures reference when the market is crossed", async () => {
    const bucket = fakeR2({ "latest.json": JSON.stringify(latestSnapshot) });
    await runScheduled(envWith(bucket), {
      [FONTERA_URL]: new Response(fixture("fonterra", "page-2026-09.html")),
      [NZX_URL]: new Response(fixture("nzx", "crossed.html")),
    });

    const snapshot = (await bucket.get("latest.json")?.then((o) => o?.json())) as MilkSnapshot;
    expect(snapshot.futures).toEqual(latestSnapshot.futures);
    expect(snapshot.official.retrievedAt).toBe("2026-09-23T06:00:00Z");
    expect(snapshot.checks?.futures).toEqual({
      source: "futures",
      checkedAt: "2026-09-23T06:00:00Z",
      outcome: "retained",
      detail: "unavailable:crossed",
    });
  });

  it("publishes a fresh unavailable futures block when there is no prior data", async () => {
    const bucket = fakeR2();
    await runScheduled(envWith(bucket), {
      [FONTERA_URL]: new Response(fixture("fonterra", "page-2026-09.html")),
      [NZX_URL]: new Response(fixture("nzx", "crossed.html")),
    });

    const snapshot = (await bucket.get("latest.json")?.then((o) => o?.json())) as MilkSnapshot;
    expect(snapshot.futures).toEqual({ status: "unavailable", reason: "crossed" });
    expect(snapshot.checks?.futures).toEqual({
      source: "futures",
      checkedAt: "2026-09-23T06:00:00Z",
      outcome: "unavailable",
      detail: "unavailable:crossed",
    });
  });

  it("does not publish when the official forecast is unusable and nothing can be retained", async () => {
    const bucket = fakeR2();
    await runScheduled(envWith(bucket), {
      [FONTERA_URL]: new Response(fixture("fonterra", "unreadable-latest.html")),
      [NZX_URL]: new Response(fixture("nzx", "page-2026-09.html")),
    });

    expect(bucket.store.has("latest.json")).toBe(false);
    expect(bucket.store.has(CURRENT_RELEASE_KEY)).toBe(false);
    // The successful futures result is still archived.
    expect([...bucket.store.keys()].some((key) => key.startsWith("archive/futures/"))).toBe(true);
  });

  it("does not retain prior data that belongs to another season", async () => {
    const prior = { ...latestSnapshot, season: "2025/26" };
    const bucket = fakeR2({ "latest.json": JSON.stringify(prior) });
    await runScheduled(envWith(bucket), {
      [FONTERA_URL]: new Response(fixture("fonterra", "unreadable-latest.html")),
      [NZX_URL]: new Response(fixture("nzx", "page-2026-09.html")),
    });

    // The stale-season snapshot is left exactly as it was.
    const snapshot = JSON.parse(bucket.store.get("latest.json") as string);
    expect(snapshot).toEqual(prior);
  });

  it("retries a transient fetch failure and still publishes", async () => {
    let calls = 0;
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === FONTERA_URL) {
        calls += 1;
        return Promise.resolve(
          calls === 1
            ? new Response("down", { status: 503 })
            : new Response(fixture("fonterra", "page-2026-09.html")),
        );
      }
      return Promise.resolve(new Response(fixture("nzx", "page-2026-09.html")));
    }) as unknown as typeof fetch;

    const bucket = fakeR2();
    const ctx = fakeCtx();
    await collector.scheduled(
      { scheduledTime: SCHEDULED_AT, cron: "0 6 * * *" },
      envWith(bucket),
      ctx,
      { fetch: fetchImpl },
    );
    await ctx.done();

    expect(calls).toBe(2);
    expect(bucket.store.has("latest.json")).toBe(true);
  });

  it("repeated runs refresh the snapshot with the new collection instant", async () => {
    const bucket = fakeR2();
    await runScheduled(envWith(bucket), healthyFetch());

    const ctx = fakeCtx();
    await collector.scheduled(
      { scheduledTime: Date.parse("2026-09-24T06:00:00Z"), cron: "0 6 * * *" },
      envWith(bucket),
      ctx,
      { fetch: fetchMock(healthyFetch()) },
    );
    await ctx.done();

    const snapshot = (await bucket.get("latest.json")?.then((o) => o?.json())) as typeof latestSnapshot;
    expect(snapshot.collectedAt).toBe("2026-09-24T06:00:00Z");
  });

  it("emits structured JSON logs for run, sources, and publication", async () => {
    const logLines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logLines.push(String(args[0]));
    });
    const bucket = fakeR2({ "latest.json": JSON.stringify(latestSnapshot) });
    await runScheduled(envWith(bucket), {
      [FONTERA_URL]: new Response(fixture("fonterra", "page-2026-09.html")),
      [NZX_URL]: new Response(fixture("nzx", "crossed.html")),
    });

    const events = logLines.map((line) => JSON.parse(line) as { event: string });
    expect(events.some((e) => e.event === "collector.run.started")).toBe(true);
    expect(events.filter((e) => e.event === "collector.source.checked")).toHaveLength(2);
    expect(events.some((e) => e.event === "collector.publish.succeeded")).toBe(true);
    expect(spy).toHaveBeenCalled();
  });
});

describe("release publication", () => {
  it("writes immutable release objects before the manifest, then the v1 mirror", async () => {
    const bucket = fakeR2();
    await runScheduled(envWith(bucket), healthyFetch());

    const snapshotKey = "releases/2026/27/20260923-060000/snapshot.json";
    const historyKey = "releases/2026/27/20260923-060000/history.json";
    expect(bucket.store.has(snapshotKey)).toBe(true);
    expect(bucket.store.has(historyKey)).toBe(true);

    // Ordering: archives, release objects, manifest, then the mirror.
    const order = bucket.putOrder;
    const archiveIdx = order.findIndex((key) => key.startsWith("archive/"));
    const releaseIdx = order.indexOf(snapshotKey);
    const historyIdx = order.indexOf(historyKey);
    const manifestIdx = order.indexOf(CURRENT_RELEASE_KEY);
    const mirrorIdx = order.indexOf("latest.json");
    expect(archiveIdx).toBeGreaterThanOrEqual(0);
    expect(releaseIdx).toBeGreaterThan(archiveIdx);
    expect(historyIdx).toBeGreaterThan(releaseIdx);
    expect(manifestIdx).toBeGreaterThan(historyIdx);
    expect(mirrorIdx).toBeGreaterThan(manifestIdx);

    const manifest = storedManifest(bucket);
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      season: "2026/27",
      provenance: "collected",
      runId: "20260923-060000",
      updatedAt: "2026-09-23T06:00:00Z",
      current: {
        runId: "20260923-060000",
        collectedAt: "2026-09-23T06:00:00Z",
        snapshotKey,
        historyKey,
      },
      previous: null,
    });

    // The committed history covers the page's dated announcements; today's
    // futures midpoint is history-ineligible and produces no entry.
    const history = storedHistory(bucket, historyKey);
    expect(history?.entries.map((e) => e.identity)).toEqual([
      "official-forecast|fonterra|2026/27|announcement|d:2026-05-28",
      "official-forecast|fonterra|2026/27|announcement|d:2026-07-13",
      "official-forecast|fonterra|2026/27|announcement|d:2026-09-21",
    ]);
    expect(history?.materialisedAt).toBe("2026-09-23T06:00:00Z");
  });

  it("advances the previous descriptor and preserves first-seen dates on the next run", async () => {
    const bucket = fakeR2();
    await runScheduled(envWith(bucket), healthyFetch());
    const firstHistory = bucket.store.get("releases/2026/27/20260923-060000/history.json");
    await runScheduled(envWith(bucket), healthyFetch(), Date.parse("2026-09-24T06:00:00Z"));

    const manifest = storedManifest(bucket);
    expect(manifest?.runId).toBe("20260924-060000");
    expect(manifest?.previous).toMatchObject({
      runId: "20260923-060000",
      snapshotKey: "releases/2026/27/20260923-060000/snapshot.json",
    });

    // Both runs' immutable objects coexist; the first run's are untouched.
    expect(bucket.store.get("releases/2026/27/20260923-060000/history.json")).toBe(firstHistory);

    const history = storedHistory(bucket, "releases/2026/27/20260924-060000/history.json");
    expect(history?.entries).toHaveLength(3);
    const opening = history?.entries.find((e) => e.identity.endsWith("d:2026-05-28"));
    expect(opening?.revisions[0].firstSeenAt).toBe("2026-09-23T06:00:00Z");
  });

  it("is idempotent when a run retries with the same run ID", async () => {
    const bucket = fakeR2();
    await runScheduled(envWith(bucket), healthyFetch());
    const firstManifest = bucket.store.get(CURRENT_RELEASE_KEY);
    const firstHistory = bucket.store.get("releases/2026/27/20260923-060000/history.json");

    await runScheduled(envWith(bucket), healthyFetch());

    const manifest = storedManifest(bucket);
    expect(manifest?.runId).toBe("20260923-060000");
    // A retry never becomes its own previous release.
    expect(manifest?.previous).toBeNull();
    expect(bucket.store.get("releases/2026/27/20260923-060000/history.json")).toBe(firstHistory);
    expect(bucket.store.get(CURRENT_RELEASE_KEY)).toBe(firstManifest);
  });

  it("rejects an older scheduled run without touching committed state", async () => {
    const bucket = fakeR2();
    await runScheduled(envWith(bucket), healthyFetch());
    await runScheduled(envWith(bucket), healthyFetch(), Date.parse("2026-09-24T06:00:00Z"));
    const manifestBefore = bucket.store.get(CURRENT_RELEASE_KEY);
    const mirrorBefore = bucket.store.get("latest.json");
    const releaseKeysBefore = [...bucket.store.keys()].filter((key) => key.startsWith("releases/"));

    const logLines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logLines.push(String(args[0]));
    });
    await runScheduled(envWith(bucket), healthyFetch());

    expect(bucket.store.get(CURRENT_RELEASE_KEY)).toBe(manifestBefore);
    expect(bucket.store.get("latest.json")).toBe(mirrorBefore);
    expect([...bucket.store.keys()].filter((key) => key.startsWith("releases/"))).toEqual(releaseKeysBefore);
    const skipped = logLines
      .map((line) => JSON.parse(line) as { event: string; reason?: string })
      .filter((e) => e.event === "collector.publish.skipped");
    expect(skipped).toEqual([{ event: "collector.publish.skipped", reason: "older-run", season: "2026/27" }]);
    spy.mockRestore();
  });

  it("rebuilds from committed history when a competing run wins the manifest", async () => {
    const competitorManifest = {
      schemaVersion: 1,
      season: "2026/27",
      provenance: "collected",
      runId: "20260924-050000",
      updatedAt: "2026-09-24T05:00:00Z",
      current: {
        runId: "20260924-050000",
        collectedAt: "2026-09-24T05:00:00Z",
        snapshotKey: "releases/2026/27/20260924-050000/snapshot.json",
        historyKey: "releases/2026/27/20260924-050000/history.json",
      },
      previous: null,
    };
    const competitorHistory = {
      schemaVersion: 1,
      season: "2026/27",
      materialisedAt: "2026-09-24T05:00:00Z",
      entries: [
        {
          identity: "mkp-futures|nzx|MKPU27|last-trade|d:2026-09-19",
          series: "mkp-futures",
          provider: "nzx",
          market: "MKPU27",
          basis: "last-trade",
          effective: { kind: "date", on: "2026-09-19" },
          revisions: [
            {
              payload: { value: 9.55, low: null, high: null, currency: "NZD", unit: "NZD/kgMS" },
              publishedAt: null,
              firstSeenAt: "2026-09-19T06:00:03Z",
              parserVersion: "nzx-1",
            },
          ],
        },
      ],
    };

    const bucket = fakeR2();
    await runScheduled(envWith(bucket), healthyFetch());
    // A competing run commits between our read and our conditional put.
    let interfered = false;
    bucket.onPut = (key) => {
      if (key !== CURRENT_RELEASE_KEY || interfered) return;
      interfered = true;
      bucket.set(CURRENT_RELEASE_KEY, JSON.stringify(competitorManifest));
      bucket.set("releases/2026/27/20260924-050000/history.json", JSON.stringify(competitorHistory));
    };

    await runScheduled(envWith(bucket), healthyFetch(), Date.parse("2026-09-24T06:00:00Z"));

    const manifest = storedManifest(bucket);
    expect(manifest?.runId).toBe("20260924-060000");
    expect(manifest?.previous).toMatchObject({ runId: "20260924-050000" });

    // The rebuilt history keeps the competitor's committed entry and adds ours.
    const history = storedHistory(bucket, "releases/2026/27/20260924-060000/history.json");
    expect(history?.entries.map((e) => e.identity)).toContain("mkp-futures|nzx|MKPU27|last-trade|d:2026-09-19");
    expect(history?.entries.filter((e) => e.series === "official-forecast")).toHaveLength(3);

    const mirror = JSON.parse(bucket.store.get("latest.json") as string);
    expect(mirror.collectedAt).toBe("2026-09-24T06:00:00Z");
  });

  it("gives up after repeated manifest conflicts without touching the mirror", async () => {
    const competitor = {
      schemaVersion: 1,
      season: "2026/27",
      provenance: "collected",
      runId: "20260924-050000",
      updatedAt: "2026-09-24T05:00:00Z",
      current: {
        runId: "20260924-050000",
        collectedAt: "2026-09-24T05:00:00Z",
        snapshotKey: "releases/2026/27/20260924-050000/snapshot.json",
        historyKey: "releases/2026/27/20260924-050000/history.json",
      },
      previous: null,
    };
    const bucket = fakeR2();
    await runScheduled(envWith(bucket), healthyFetch());
    // Every manifest put is preceded by another writer, so no attempt can win.
    bucket.onPut = (key) => {
      if (key === CURRENT_RELEASE_KEY) bucket.set(CURRENT_RELEASE_KEY, JSON.stringify(competitor));
    };

    const logLines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logLines.push(String(args[0]));
    });
    await runScheduled(envWith(bucket), healthyFetch(), Date.parse("2026-09-24T06:00:00Z"));
    spy.mockRestore();

    expect(storedManifest(bucket)?.runId).toBe("20260924-050000");
    // The mirror only updates after a committed manifest.
    expect(JSON.parse(bucket.store.get("latest.json") as string).collectedAt).toBe("2026-09-23T06:00:00Z");
    const failed = logLines
      .map((line) => JSON.parse(line) as { event: string; reason?: string })
      .filter((e) => e.event === "collector.publish.failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBe("manifest-conflict");
  });

  it("keeps the committed manifest when the mirror write keeps failing", async () => {
    const bucket = fakeR2();
    bucket.failKeys.add("latest.json");
    await runScheduled(envWith(bucket), healthyFetch());

    expect(storedManifest(bucket)?.runId).toBe("20260923-060000");
    expect(bucket.store.has("latest.json")).toBe(false);
    expect(bucket.store.has("releases/2026/27/20260923-060000/snapshot.json")).toBe(true);
  });

  it("retries a transient mirror failure", async () => {
    const bucket = fakeR2();
    bucket.failOnceKeys.add("latest.json");
    await runScheduled(envWith(bucket), healthyFetch());

    expect(bucket.store.has("latest.json")).toBe(true);
    expect(storedManifest(bucket)?.runId).toBe("20260923-060000");
  });

  it("fails the run without publishing when a release-object write fails", async () => {
    const bucket = fakeR2({ "latest.json": JSON.stringify(latestSnapshot) });
    bucket.failKeys.add("releases/2026/27/20260923-060000/snapshot.json");
    const mirrorBefore = bucket.store.get("latest.json");

    await expect(
      runScheduled(envWith(bucket), healthyFetch()),
    ).rejects.toThrow("injected put failure");
    expect(bucket.store.get("latest.json")).toBe(mirrorBefore);
    expect(bucket.store.has(CURRENT_RELEASE_KEY)).toBe(false);
  });

  it("deletes archives past the retention window and keeps the rest", async () => {
    const bucket = fakeR2({
      "archive/official/2025-06-01T06:00:00Z.json": "{}",
      // Exactly 400 days before the run instant: still inside retention.
      "archive/official/2025-08-19T06:00:00Z.json": "{}",
      "archive/futures/2026-09-22T06:00:00Z.json": "{}",
    });
    await runScheduled(envWith(bucket), healthyFetch());

    expect(bucket.store.has("archive/official/2025-06-01T06:00:00Z.json")).toBe(false);
    expect(bucket.store.has("archive/official/2025-08-19T06:00:00Z.json")).toBe(true);
    expect(bucket.store.has("archive/futures/2026-09-22T06:00:00Z.json")).toBe(true);
    expect(bucket.store.has("archive/official/2026-09-23T06:00:00Z.json")).toBe(true);
  });
});

describe("season rollover", () => {
  it("starts the new season on 1 June Auckland without importing the old one", async () => {
    const bucket = fakeR2();
    await runScheduled(envWith(bucket), healthyFetch());

    // 31 May 2027 Auckland is still the 2026/27 season.
    await runScheduled(envWith(bucket), healthyFetch(), Date.parse("2027-05-31T06:00:00Z"));
    expect(storedManifest(bucket)).toMatchObject({ season: "2026/27", runId: "20270531-060000" });

    const oldHistory = bucket.store.get("releases/2026/27/20260923-060000/history.json");
    const oldSnapshot = bucket.store.get("releases/2026/27/20260923-060000/snapshot.json");

    // 1 June 2027 Auckland opens 2027/28 from the labelled new-season page.
    await runScheduled(
      envWith(bucket),
      {
        [FONTERA_URL]: new Response(fixture("fonterra", "page-2027-06.html")),
        [NZX_URL]: new Response(fixture("nzx", "crossed.html")),
      },
      Date.parse("2027-06-01T06:00:00Z"),
    );

    const manifest = storedManifest(bucket);
    expect(manifest?.season).toBe("2027/28");
    expect(manifest?.runId).toBe("20270601-060000");
    // The new season has no previous release of its own.
    expect(manifest?.previous).toBeNull();

    const history = parseSeasonHistory(
      JSON.parse(bucket.store.get("releases/2027/28/20270601-060000/history.json") as string),
      "2027/28",
    );
    expect(history?.entries.map((e) => e.identity)).toEqual([
      "official-forecast|fonterra|2027/28|announcement|d:2027-05-27",
    ]);

    // Old-season immutable objects are untouched.
    expect(bucket.store.get("releases/2026/27/20260923-060000/history.json")).toBe(oldHistory);
    expect(bucket.store.get("releases/2026/27/20260923-060000/snapshot.json")).toBe(oldSnapshot);

    const mirror = JSON.parse(bucket.store.get("latest.json") as string) as MilkSnapshot;
    expect(mirror.season).toBe("2027/28");
    expect(mirror.official).toMatchObject({ midpoint: 10.5, announcedAt: "2027-05-27" });
  });
});
