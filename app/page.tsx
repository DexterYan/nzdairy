import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readRelease, type ReleaseRead, type ReleaseReader } from "../lib/release";
import ComparisonView from "./comparison-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  const read = await loadRelease();
  return (
    <ComparisonView snapshot={read.snapshot} provenance={read.provenance} />
  );
}

// The release ladder (no manifest → legacy; bad snapshot → previous release →
// legacy) lives in lib/release.ts; a broken binding still renders the
// unavailable state, never a crashed page.
async function loadRelease(): Promise<ReleaseRead> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    // Structural cast keeps workers-types globals out of Next's DOM-type world.
    const bucket = (env as unknown as { SNAPSHOTS: ReleaseReader }).SNAPSHOTS;
    return await readRelease(bucket);
  } catch {
    return { kind: "legacy", snapshot: null, provenance: "unknown" };
  }
}
