import { describe, expect, it } from "vitest";
import fixture from "../fixtures/latest-snapshot.json";
import {
  LATEST_SNAPSHOT_KEY,
  readLatestSnapshot,
  type SnapshotBucket,
  type SnapshotObject,
} from "../lib/snapshot";

function bucketWith(body: unknown): SnapshotBucket {
  return {
    async get(key: string): Promise<SnapshotObject | null> {
      if (key !== LATEST_SNAPSHOT_KEY) return null;
      return { json: async () => body };
    },
  };
}

function emptyBucket(): SnapshotBucket {
  return { async get(): Promise<SnapshotObject | null> { return null; } };
}

function corruptBucket(): SnapshotBucket {
  return {
    async get(): Promise<SnapshotObject | null> {
      return { json: () => Promise.reject(new SyntaxError("Unexpected token")) };
    },
  };
}

describe("readLatestSnapshot", () => {
  it("returns the stored snapshot for a valid latest document", async () => {
    const snapshot = await readLatestSnapshot(bucketWith(fixture));

    expect(snapshot).toEqual(fixture);
  });

  it("returns null when no latest object exists", async () => {
    const snapshot = await readLatestSnapshot(emptyBucket());

    expect(snapshot).toBeNull();
  });

  it("returns null when the stored body is not valid JSON", async () => {
    const snapshot = await readLatestSnapshot(corruptBucket());

    expect(snapshot).toBeNull();
  });

  it("returns null for an unsupported schema version", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, schemaVersion: 2 }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when the official midpoint is not a positive number", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, official: { ...fixture.official, midpoint: 0 } }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when the published range is crossed", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, official: { ...fixture.official, low: 10.5 } }),
    );

    expect(snapshot).toBeNull();
  });

  it("keeps missing range endpoints missing rather than inventing them", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        official: { ...fixture.official, low: null, high: null, rangeSource: "none" },
      }),
    );

    expect(snapshot?.official.low).toBeNull();
    expect(snapshot?.official.high).toBeNull();
  });

  it("returns null when rangeSource disagrees with the endpoints", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        official: { ...fixture.official, rangeSource: "none" },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null for an unknown rangeSource", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        official: { ...fixture.official, rangeSource: "estimated" },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null for an impossible calendar date in announcedAt", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        official: { ...fixture.official, announcedAt: "2026-09-31" },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null for an impossible calendar date in noChangeUpdate", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        official: { ...fixture.official, noChangeUpdate: { date: "2026-02-30" } },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("round-trips a futures block that is unavailable for a stated reason", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, futures: { status: "unavailable", reason: "crossed" } }),
    );

    expect(snapshot?.futures).toEqual({ status: "unavailable", reason: "crossed" });
  });

  it("round-trips a not-collected futures block from a run with no prior data", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, futures: { status: "unavailable", reason: "not-collected" } }),
    );

    expect(snapshot?.futures).toEqual({ status: "unavailable", reason: "not-collected" });
  });

  it("returns null when the futures price is not a positive number", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, futures: { ...fixture.futures, price: 0 } }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when the futures price disagrees with its stated midpoint basis", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, futures: { ...fixture.futures, price: 9.5 } }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when a last-trade basis lacks its trade date", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        futures: {
          ...fixture.futures,
          basis: "last-trade",
          bid: null,
          offer: null,
          last: 9.9,
          price: 9.9,
        },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when the futures block names a different season", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, futures: { ...fixture.futures, season: "2025/26" } }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null for an unknown futures unavailability reason", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, futures: { status: "unavailable", reason: "meh" } }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null for a futures contract from a substitute season", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, futures: { ...fixture.futures, contractCode: "MKPU26" } }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when the futures expiry is not the season's closing September", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, futures: { ...fixture.futures, expiry: "2027-11-30" } }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when the futures contract had already expired at collection", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        collectedAt: "2027-10-01T06:00:00Z",
        futures: { ...fixture.futures, expiry: "2027-09-30" },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when a last-trade price disagrees with the reference price", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        futures: {
          ...fixture.futures,
          basis: "last-trade",
          bid: null,
          offer: null,
          last: 9.9,
          tradedAt: "2026-09-22",
        },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when a prior-settlement price disagrees with the reference price", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        futures: {
          ...fixture.futures,
          basis: "prior-settlement",
          bid: null,
          offer: null,
          last: null,
          price: 9.5,
        },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null for a crossed market regardless of the stated basis", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        futures: {
          ...fixture.futures,
          basis: "prior-settlement",
          bid: 11,
          offer: 10,
          price: 9.85,
        },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when a two-sided market is not quoted as its midpoint", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        futures: {
          ...fixture.futures,
          basis: "last-trade",
          last: 9.9,
          tradedAt: "2026-09-22",
          price: 9.9,
        },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when a last-trade basis carries an invalid trade date", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        futures: {
          ...fixture.futures,
          basis: "last-trade",
          bid: null,
          offer: null,
          last: 9.875,
          tradedAt: "22 September 2026",
        },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when the quote timestamp is not a valid instant", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({ ...fixture, futures: { ...fixture.futures, quotedAt: "yesterday" } }),
    );

    expect(snapshot).toBeNull();
  });

  it("returns null when a prior-settlement basis carries a qualified last trade", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        futures: {
          ...fixture.futures,
          basis: "prior-settlement",
          bid: null,
          offer: null,
          last: 9.9,
          tradedAt: "2026-09-22",
          price: 9.85,
        },
      }),
    );

    expect(snapshot).toBeNull();
  });

  it("keeps a prior-settlement basis whose last trade lacks its trade date", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        futures: {
          ...fixture.futures,
          basis: "prior-settlement",
          bid: null,
          offer: null,
          last: 9.9,
          price: 9.85,
        },
      }),
    );

    expect(snapshot?.futures).toEqual({
      ...fixture.futures,
      basis: "prior-settlement",
      bid: null,
      offer: null,
      last: 9.9,
      price: 9.85,
    });
  });

  it("returns null when the stale flag disagrees with the quote age", async () => {
    const snapshot = await readLatestSnapshot(
      bucketWith({
        ...fixture,
        futures: {
          ...fixture.futures,
          quotedAt: "2026-09-15T06:00:00Z",
          stale: false,
        },
      }),
    );

    expect(snapshot).toBeNull();
  });
});
