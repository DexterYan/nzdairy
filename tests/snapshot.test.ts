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
});
