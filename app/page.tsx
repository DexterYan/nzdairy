import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readLatestSnapshot, type MilkSnapshot, type SnapshotBucket } from "../lib/snapshot";
import ComparisonView from "./comparison-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <ComparisonView snapshot={await loadSnapshot()} />;
}

async function loadSnapshot(): Promise<MilkSnapshot | null> {
  // A broken binding or unreadable object renders the unavailable state, never a crashed page.
  try {
    const { env } = await getCloudflareContext({ async: true });
    // Structural cast keeps workers-types globals out of Next's DOM-type world.
    const bucket = (env as unknown as { SNAPSHOTS: SnapshotBucket }).SNAPSHOTS;
    return await readLatestSnapshot(bucket);
  } catch {
    return null;
  }
}
