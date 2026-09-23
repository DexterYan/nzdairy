import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import latestSnapshot from "../fixtures/latest-snapshot.json";
import type { MilkSnapshot } from "../lib/snapshot";
import collector, {
  type CollectorEnv,
  type CollectionBucket,
} from "../workers/collection";

const SCHEDULED_AT = Date.parse("2026-09-23T06:00:00Z");

function fixture(dir: "fonterra" | "nzx", name: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", dir, name), "utf8");
}

function fakeBucket(initial: Record<string, string> = {}): CollectionBucket & {
  store: Map<string, string>;
  putOrder: string[];
} {
  const store = new Map(Object.entries(initial));
  const putOrder: string[] = [];
  return {
    store,
    putOrder,
    async get(key: string) {
      const value = store.get(key);
      if (value === undefined) return null;
      return { json: async () => JSON.parse(value) };
    },
    async put(key: string, value: string) {
      putOrder.push(key);
      store.set(key, value);
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

function envWith(bucket: CollectionBucket): CollectorEnv {
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
): Promise<ReturnType<typeof fakeCtx>> {
  const ctx = fakeCtx();
  await collector.scheduled(
    { scheduledTime: SCHEDULED_AT, cron: "0 6 * * *" },
    env,
    ctx,
    byUrl ? { fetch: fetchMock(byUrl) } : undefined,
  );
  await ctx.done();
  return ctx;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collector scheduled run", () => {
  it("archives both sources and publishes a valid snapshot on a healthy run", async () => {
    const bucket = fakeBucket();
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
    const bucket = fakeBucket({ "latest.json": JSON.stringify(latestSnapshot) });
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
    const bucket = fakeBucket({ "latest.json": JSON.stringify(latestSnapshot) });
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
    const bucket = fakeBucket();
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
    const bucket = fakeBucket();
    await runScheduled(envWith(bucket), {
      [FONTERA_URL]: new Response(fixture("fonterra", "unreadable-latest.html")),
      [NZX_URL]: new Response(fixture("nzx", "page-2026-09.html")),
    });

    expect(bucket.store.has("latest.json")).toBe(false);
    // The successful futures result is still archived.
    expect([...bucket.store.keys()].some((key) => key.startsWith("archive/futures/"))).toBe(true);
  });

  it("does not retain prior data that belongs to another season", async () => {
    const prior = { ...latestSnapshot, season: "2025/26" };
    const bucket = fakeBucket({ "latest.json": JSON.stringify(prior) });
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

    const bucket = fakeBucket();
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
    const bucket = fakeBucket();
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
    const bucket = fakeBucket({ "latest.json": JSON.stringify(latestSnapshot) });
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
