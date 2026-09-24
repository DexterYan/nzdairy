import { describe, expect, it } from "vitest";
import snapshotFixture from "../fixtures/latest-snapshot.json";
import historyFixture from "../fixtures/release/history.json";
import manifestFixture from "../fixtures/release/current-release.json";
import {
  CURRENT_CONTEXT_KEY,
  CURRENT_RELEASE_KEY,
  conditionalPut,
  contextCardFreshness,
  parseContextCard,
  parseReleaseManifest,
  readContext,
  readRelease,
  releaseKeys,
  type ContextCard,
  type ReleaseStorage,
} from "../lib/release";

// Mirrors the verified R2 binding semantics: precondition failure on put
// returns false without storing; every stored object gets a fresh etag.
class FakeStorage implements ReleaseStorage {
  private objects = new Map<string, { etag: string; body: string }>();
  private counter = 0;

  async get(key: string) {
    const object = this.objects.get(key);
    if (object === undefined) return null;
    return {
      etag: object.etag,
      json: async () => JSON.parse(object.body),
    };
  }

  async put(key: string, value: string, condition?: Parameters<ReleaseStorage["put"]>[2]) {
    const existing = this.objects.get(key);
    if (condition && "ifMatch" in condition) {
      if (existing === undefined || existing.etag !== condition.ifMatch) return false;
    }
    if (condition && "ifNoneMatchAny" in condition && existing !== undefined) return false;
    const etag = `etag-${++this.counter}`;
    this.objects.set(key, { etag, body: value });
    return true;
  }

  seed(key: string, body: unknown, etag?: string): string {
    const assigned = etag ?? `etag-${++this.counter}`;
    this.objects.set(key, { etag: assigned, body: typeof body === "string" ? body : JSON.stringify(body) });
    return assigned;
  }

  seedCorrupt(key: string): void {
    this.objects.set(key, { etag: `etag-${++this.counter}`, body: "not json" });
  }

  etagOf(key: string): string | null {
    return this.objects.get(key)?.etag ?? null;
  }
}

function validContextCard(overrides: Partial<ContextCard> = {}): ContextCard {
  const card = parseContextCard({
    id: "nzd-usd",
    source: "RBNZ B1",
    sourceUrl: "https://www.rbnz.govt.nz/statistics/series/data-file-index-page",
    period: "2026-09-24",
    value: 0.6112,
    unit: "NZD/USD",
    currency: null,
    observedAt: "2026-09-24T02:00:00Z",
    nextExpectedAt: "2026-09-25T02:00:00Z",
    graceMs: 3_600_000,
    check: { checkedAt: "2026-09-24T06:00:00Z", outcome: "ok", detail: null },
    change: { fromValue: 0.6089, fromAt: "2026-09-17T02:00:00Z" },
  });
  expect(card).not.toBeNull();
  return { ...(card as ContextCard), ...overrides };
}

describe("releaseKeys", () => {
  it("derives immutable per-run keys under the season", () => {
    expect(releaseKeys("2026/27", "run-1")).toEqual({
      snapshotKey: "releases/2026/27/run-1/snapshot.json",
      historyKey: "releases/2026/27/run-1/history.json",
    });
  });
});

describe("parseReleaseManifest", () => {
  it("parses the representative fixture", () => {
    const manifest = parseReleaseManifest(manifestFixture);
    expect(manifest?.season).toBe("2026/27");
    expect(manifest?.provenance).toBe("collected");
    expect(manifest?.current.snapshotKey).toBe("releases/2026/27/20260923-060012/snapshot.json");
    expect(manifest?.previous?.runId).toBe("20260922-060009");
  });

  it("rejects a snapshot key that does not match season and run", () => {
    const wrongKey = structuredClone(manifestFixture);
    wrongKey.current.snapshotKey = "releases/2025/26/20260923-060012/snapshot.json";
    expect(parseReleaseManifest(wrongKey)).toBeNull();
  });

  it("rejects a current descriptor whose runId disagrees with the manifest", () => {
    const mismatched = structuredClone(manifestFixture);
    mismatched.current.runId = "other-run";
    expect(parseReleaseManifest(mismatched)).toBeNull();
  });

  it("rejects a previous descriptor with the same runId as current", () => {
    const same = structuredClone(manifestFixture);
    same.previous.runId = same.current.runId;
    expect(parseReleaseManifest(same)).toBeNull();
  });

  it("rejects unsafe runIds and unknown versions", () => {
    const traversal = structuredClone(manifestFixture);
    traversal.runId = "../evil";
    traversal.current.runId = "../evil";
    expect(parseReleaseManifest(traversal)).toBeNull();

    const versioned = structuredClone(manifestFixture);
    versioned.schemaVersion = 2;
    expect(parseReleaseManifest(versioned)).toBeNull();

    const provenance = structuredClone(manifestFixture);
    provenance.provenance = "live";
    expect(parseReleaseManifest(provenance)).toBeNull();
  });
});

describe("readRelease", () => {
  function seededReleaseStorage(): FakeStorage {
    const storage = new FakeStorage();
    storage.seed(CURRENT_RELEASE_KEY, manifestFixture);
    storage.seed(manifestFixture.current.snapshotKey, snapshotFixture);
    storage.seed(manifestFixture.current.historyKey, historyFixture);
    return storage;
  }

  it("reads a full release with history", async () => {
    const read = await readRelease(seededReleaseStorage());
    expect(read.kind).toBe("release");
    if (read.kind !== "release") return;
    expect(read.snapshot.season).toBe("2026/27");
    expect(read.history?.entries).toHaveLength(4);
    expect(read.provenance).toBe("collected");
  });

  it("falls back to the legacy snapshot when no manifest exists", async () => {
    const storage = new FakeStorage();
    storage.seed("latest.json", snapshotFixture);
    const read = await readRelease(storage);
    expect(read).toMatchObject({ kind: "legacy", provenance: "unknown" });
    if (read.kind !== "legacy") return;
    expect(read.snapshot?.season).toBe("2026/27");
  });

  it("falls back to the legacy snapshot when the manifest is corrupt", async () => {
    const storage = new FakeStorage();
    storage.seedCorrupt(CURRENT_RELEASE_KEY);
    storage.seed("latest.json", snapshotFixture);
    const read = await readRelease(storage);
    expect(read.kind).toBe("legacy");
  });

  it("keeps valid manifest prices when history is missing", async () => {
    const storage = seededReleaseStorage();
    storage.seed(manifestFixture.current.historyKey, null);
    const read = await readRelease(storage);
    expect(read.kind).toBe("release");
    if (read.kind !== "release") return;
    expect(read.history).toBeNull();
    expect(read.snapshot.official.midpoint).toBe(9.5);
  });

  it("keeps valid manifest prices when history is corrupt", async () => {
    const storage = seededReleaseStorage();
    storage.seedCorrupt(manifestFixture.current.historyKey);
    const read = await readRelease(storage);
    expect(read.kind).toBe("release");
    if (read.kind !== "release") return;
    expect(read.history).toBeNull();
  });

  it("keeps valid manifest prices when history belongs to another season", async () => {
    const storage = seededReleaseStorage();
    const wrongSeason = structuredClone(historyFixture);
    wrongSeason.season = "2025/26";
    storage.seed(manifestFixture.current.historyKey, wrongSeason);
    const read = await readRelease(storage);
    expect(read.kind).toBe("release");
    if (read.kind !== "release") return;
    expect(read.history).toBeNull();
  });

  it("tries the manifest's previous release when the current snapshot is invalid", async () => {
    const storage = seededReleaseStorage();
    const invalid = structuredClone(snapshotFixture);
    invalid.schemaVersion = 2;
    storage.seed(manifestFixture.current.snapshotKey, invalid);
    storage.seed(manifestFixture.previous.snapshotKey, snapshotFixture);
    const read = await readRelease(storage);
    expect(read.kind).toBe("release");
    if (read.kind !== "release") return;
    expect(read.manifest.current.runId).toBe("20260923-060012");
    expect(read.snapshot.collectedAt).toBe(snapshotFixture.collectedAt);
  });

  it("rejects a current snapshot from the wrong season and tries the previous release", async () => {
    const storage = seededReleaseStorage();
    const wrongSeason = structuredClone(snapshotFixture);
    wrongSeason.season = "2025/26";
    storage.seed(manifestFixture.current.snapshotKey, wrongSeason);
    storage.seed(manifestFixture.previous.snapshotKey, snapshotFixture);
    const read = await readRelease(storage);
    expect(read.kind).toBe("release");
  });

  it("falls back to legacy when both manifest snapshots are unusable", async () => {
    const storage = seededReleaseStorage();
    storage.seedCorrupt(manifestFixture.current.snapshotKey);
    storage.seedCorrupt(manifestFixture.previous.snapshotKey);
    storage.seed("latest.json", snapshotFixture);
    const read = await readRelease(storage);
    expect(read.kind).toBe("legacy");
  });
});

describe("conditionalPut", () => {
  it("creates when no prior object exists and refuses to overwrite on a second create", async () => {
    const storage = new FakeStorage();
    expect(await conditionalPut(storage, CURRENT_RELEASE_KEY, "{}", null)).toBe(true);
    expect(await conditionalPut(storage, CURRENT_RELEASE_KEY, "{}", null)).toBe(false);
    expect(JSON.parse((storage as never as { objects: Map<string, { body: string }> }).objects.get(CURRENT_RELEASE_KEY)?.body ?? "null")).toEqual({});
  });

  it("updates only when the etag still matches the one read at run start", async () => {
    const storage = new FakeStorage();
    const original = storage.seed(CURRENT_RELEASE_KEY, manifestFixture);
    expect(await conditionalPut(storage, CURRENT_RELEASE_KEY, "{}", original)).toBe(true);
    expect(await conditionalPut(storage, CURRENT_RELEASE_KEY, "{}", original)).toBe(false);
  });

  it("refuses an update against a missing object", async () => {
    const storage = new FakeStorage();
    expect(await conditionalPut(storage, CURRENT_RELEASE_KEY, "{}", "etag-stale")).toBe(false);
  });
});

describe("readContext", () => {
  function contextBody(cards: unknown[]): Record<string, unknown> {
    return {
      schemaVersion: 1,
      season: "2026/27",
      generatedAt: "2026-09-24T06:00:00Z",
      cards,
    };
  }

  it("reads valid cards and drops invalid ones independently", async () => {
    const storage = new FakeStorage();
    const good = validContextCard();
    const broken = { ...good, id: "broken", sourceUrl: "javascript:alert(1)" };
    storage.seed(CURRENT_CONTEXT_KEY, contextBody([good, broken]));
    const context = await readContext(storage);
    expect(context?.cards).toHaveLength(1);
    expect(context?.cards[0].id).toBe("nzd-usd");
  });

  it("returns null when the object is missing, corrupt, or has no valid cards", async () => {
    const empty = new FakeStorage();
    expect(await readContext(empty)).toBeNull();

    const corrupt = new FakeStorage();
    corrupt.seedCorrupt(CURRENT_CONTEXT_KEY);
    expect(await readContext(corrupt)).toBeNull();

    const allBad = new FakeStorage();
    allBad.seed(CURRENT_CONTEXT_KEY, contextBody([{ nope: true }]));
    expect(await readContext(allBad)).toBeNull();
  });
});

describe("contextCardFreshness", () => {
  it("flags overdue only past the expected publication plus grace", () => {
    const card = validContextCard({
      nextExpectedAt: "2026-09-25T02:00:00Z",
      graceMs: 3_600_000,
    });
    const due = Date.parse("2026-09-25T03:00:00Z");
    expect(contextCardFreshness(card, due)).toEqual({ schedule: "known", overdue: false });
    expect(contextCardFreshness(card, due + 1)).toEqual({ schedule: "known", overdue: true });
  });

  it("treats a missing schedule or grace as unknown rather than fresh", () => {
    expect(contextCardFreshness(validContextCard({ nextExpectedAt: null }), Date.now()))
      .toEqual({ schedule: "unknown", overdue: false });
    expect(contextCardFreshness(validContextCard({ graceMs: null }), Date.now()))
      .toEqual({ schedule: "unknown", overdue: false });
  });
});
