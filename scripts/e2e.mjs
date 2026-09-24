// End-to-end verification against the OpenNext preview on :8787.
// Requires `npm run build && npm run build:worker` first; seeds local R2,
// starts the preview Worker, and exercises the main journey plus degraded
// states over real HTTP against the target runtime.
import { spawn, spawnSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://localhost:8787";
const WRANGLER_CONFIG = "wrangler.jsonc";
const BUCKET = "milkcompass-snapshots";

let failures = 0;
function check(name, condition, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  console.log(`${mark} ${name}${condition || !detail ? "" : ` — ${detail}`}`);
  if (!condition) failures += 1;
}

function seed(key, file) {
  execSync(
    `npx wrangler r2 object put ${BUCKET}/${key} --local -c ${WRANGLER_CONFIG} --file ${file} --content-type application/json`,
    { stdio: "pipe" },
  );
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`);
  const raw = await response.text();
  // React SSR separates adjacent text nodes with <!-- --> comments; strip
  // them so markers match the text users actually see.
  const body = raw.replace(/<!--[\s\S]*?-->/g, "");
  return { status: response.status, body };
}

async function waitForReady() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const { status } = await get("/");
      if (status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("preview server did not become ready on :8787");
}

// Seeding local R2 while the preview runs makes wrangler dev reload its
// workerd; the listener briefly resets. Wait for it to serve steadily
// before asserting on responses.
async function settle() {
  let steady = 0;
  for (let attempt = 0; attempt < 120 && steady < 3; attempt += 1) {
    try {
      const { status } = await get("/");
      steady = status === 200 ? steady + 1 : 0;
    } catch {
      steady = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (steady < 3) throw new Error("preview server did not settle after seeding");
}

// workerd escapes the detached process group, so a crashed run can leave an
// orphan holding :8787. This script owns that port for its lifetime.
function killOrphanPreview() {
  spawnSync("pkill", ["-f", "socket-addr=entry=localhost:8787"]);
}

// Next splits CSS across chunks; assert against all of them joined.
async function stylesheets(page) {
  const hrefs = [...page.body.matchAll(/href="(\/_next\/[^"]+\.css)"/g)].map(
    (match) => match[1],
  );
  const sheets = await Promise.all(hrefs.map((href) => get(href)));
  return sheets.map((sheet) => sheet.body).join("\n");
}

async function journey() {
  const page = await get("/");
  check("journey: page responds", page.status === 200);
  for (const marker of [
    "MilkCompass",
    "2026/27 season",
    "What does the milk price mean for your farm?",
    "$9.50",
    "Range $8.50-$10.50 /kgMS",
    "Announced 21 Sept 2026",
    "Checked 23 Sept 2026",
    "$9.88",
    "Midpoint of bid $9.75 and offer $10.00",
    "Contract MKPU27 · expires 30 Sept 2027",
    "Expected full-season production, kgMS",
    "Use 150,000 kgMS as an example",
    "Reset scenarios to Fonterra&#x27;s published values",
    "not live prices",
    // The what-changed section renders from the seeded history; the futures
    // suppression wording ages with the run date, so only date-free facts.
    "What changed",
    "Fonterra forecast $9.50 on 21 Sept 2026, revised from $9.25 on 28 Aug 2026.",
  ]) {
    check(`journey: shows ${JSON.stringify(marker)}`, page.body.includes(marker));
  }

  // The slider is a convenience layer over the text field (design.md §4.5):
  // native range input, interaction-only bounds, and its own a11y wiring.
  const slider = page.body.match(/<input[^>]*type="range"[^>]*>/);
  check(
    "journey: production slider ships with interaction bounds and a11y wiring",
    slider !== null &&
      /min="20000"/.test(slider[0]) &&
      /max="500000"/.test(slider[0]) &&
      /step="1000"/.test(slider[0]) &&
      /aria-label="Production slider"/.test(slider[0]) &&
      /aria-describedby="production-slider-note"/.test(slider[0]),
    slider === null ? "no range input in SSR output" : "",
  );
  check(
    "journey: slider note names units and approximation",
    page.body.includes('id="production-slider-note"') &&
      page.body.includes("approximate"),
  );

  check(
    "a11y: viewport meta for mobile widths",
    page.body.includes('name="viewport"'),
  );
  // The seeded manifest claims provenance "collected"; the footer must say so.
  check(
    "journey: footer shows collected provenance with its date",
    page.body.includes(
      "Collected from Fonterra and NZX on 23 Sept 2026 — delayed reference data, not live prices.",
    ),
  );
  const css = await stylesheets(page);
  check("a11y: stylesheet served", css !== "");
  check(
    "responsive: cards stack below 45rem (375px layout)",
    /@media \(min-width:\s*45rem\)/.test(css),
  );
  check(
    "a11y: visible focus styles shipped",
    css.includes(":focus-visible"),
  );
}

// The fixture pair (midpoint snapshot, last-trade history) suppresses its
// futures summaries, so this phase seeds a fresh same-basis reference and
// history generated at run time to exercise the comparable sentences over
// real SSR. Dates are Auckland calendar dates anchored on local midnight.
async function whatChangedJourney() {
  const nowIso = new Date().toISOString();
  const aklIso = (ms) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Pacific/Auckland",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  const aklLabel = (ms) =>
    new Intl.DateTimeFormat("en-NZ", {
      timeZone: "Pacific/Auckland",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(ms));
  const todayIso = aklIso(Date.now());
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);
  // A date-only baseline stays eligible only once its whole Auckland day has
  // ended by the weekly cutoff, so it must sit eight days back.
  const pastMs = todayMs - 8 * 86_400_000;

  const base = JSON.parse(readFileSync("fixtures/latest-snapshot.json", "utf8"));
  const snapshot = {
    ...base,
    collectedAt: nowIso,
    futures: {
      ...base.futures,
      basis: "last-trade",
      price: 9.9,
      bid: null,
      offer: null,
      last: 9.9,
      priorSettlement: null,
      stale: false,
      quotedAt: nowIso,
      tradedAt: todayIso,
      retrievedAt: nowIso,
    },
    checks: {
      official: { source: "official", checkedAt: nowIso, outcome: "ok", detail: null },
      futures: { source: "futures", checkedAt: nowIso, outcome: "ok", detail: null },
    },
  };
  const futEntry = (on, value) => ({
    identity: `mkp-futures|nzx|MKPU27|last-trade|d:${on}`,
    series: "mkp-futures",
    provider: "nzx",
    market: "MKPU27",
    basis: "last-trade",
    effective: { kind: "date", on },
    revisions: [
      {
        payload: { value, low: null, high: null, currency: "NZD", unit: "NZD/kgMS" },
        publishedAt: null,
        firstSeenAt: nowIso,
        parserVersion: "e2e",
      },
    ],
  });
  const history = {
    schemaVersion: 1,
    season: "2026/27",
    materialisedAt: nowIso,
    entries: [
      {
        identity: "official-forecast|fonterra|2026/27|announcement|d:2026-08-28",
        series: "official-forecast",
        provider: "fonterra",
        market: "2026/27",
        basis: "announcement",
        effective: { kind: "date", on: "2026-08-28" },
        revisions: [
          {
            payload: { value: 9.25, low: 8.75, high: 9.75, currency: "NZD", unit: "NZD/kgMS" },
            publishedAt: null,
            firstSeenAt: nowIso,
            parserVersion: "e2e",
          },
        ],
      },
      futEntry(aklIso(pastMs), 9.7),
      futEntry("2026-08-27", 9.6),
      futEntry(todayIso, 9.9),
    ],
  };
  const manifest = JSON.parse(readFileSync("fixtures/release/current-release.json", "utf8"));
  const snapshotFile = join(tmpdir(), "milkcompass-e2e-what-changed-snapshot.json");
  const historyFile = join(tmpdir(), "milkcompass-e2e-what-changed-history.json");
  writeFileSync(snapshotFile, JSON.stringify(snapshot));
  writeFileSync(historyFile, JSON.stringify(history));
  seed(manifest.current.snapshotKey, snapshotFile);
  seed(manifest.current.historyKey, historyFile);
  seed("latest.json", snapshotFile);
  await settle();

  const page = await get("/");
  const todayLabel = aklLabel(todayMs);
  const pastLabel = aklLabel(pastMs);
  const section =
    page.body.match(/<section[^>]*what-changed-heading[\s\S]*?<\/section>/)?.[0] ??
    "no what-changed section";
  // Sentences carry <strong>/<span> markup, so compare as tag-free text.
  const text = section.replace(/<[^>]+>/g, "");
  check(
    "what-changed: comparable weekly sentence with Auckland dates",
    text.includes(
      `Since last week — futures reference $9.90 on ${todayLabel}, up $0.20 from $9.70 on ${pastLabel}.`,
    ),
    text,
  );
  check(
    "what-changed: since-announcement sentence with its own baseline",
    text.includes(
      `Since Fonterra&#x27;s announcement — futures reference $9.90 on ${todayLabel}, up $0.30 from $9.60 on 27 Aug 2026.`,
    ),
    text,
  );
  check(
    "what-changed: section ships as a labelled landmark",
    page.body.includes('id="what-changed-heading"'),
  );
}

async function degradedCorruptSnapshot() {
  const corrupt = join(tmpdir(), "milkcompass-e2e-corrupt.json");
  writeFileSync(corrupt, "{not json");
  // Both the manifest and the mirror must break before the page gives up.
  seed("current-release.json", corrupt);
  seed("latest.json", corrupt);
  await settle();

  const page = await get("/");
  check(
    "degraded: corrupt snapshot renders the unavailable state",
    page.status === 200 &&
      page.body.includes("Reference prices are unavailable right now."),
  );
  check(
    "degraded: no prices leak from a corrupt snapshot",
    !page.body.includes("$9.50") && !page.body.includes("$9.88"),
  );
  check(
    "degraded: page shell survives a corrupt snapshot",
    page.body.includes("What does the milk price mean for your farm?"),
  );
  check(
    "degraded: unknown provenance never claims live prices",
    page.body.includes("collection date unknown"),
  );
}

// A corrupt current release falls back to the manifest's previous release;
// the mirror holds different (stale) data and must not win.
async function degradedPreviousReleaseFallback() {
  const manifest = JSON.parse(readFileSync("fixtures/release/current-release.json", "utf8"));
  // The previous test corrupted the manifest; restore it for this scenario.
  seed("current-release.json", "fixtures/release/current-release.json");
  seed(manifest.previous.snapshotKey, "fixtures/latest-snapshot.json");
  seed(manifest.previous.historyKey, "fixtures/release/history.json");
  const corrupt = join(tmpdir(), "milkcompass-e2e-corrupt.json");
  seed(manifest.current.snapshotKey, corrupt);

  // The mirror disagrees with the release the manifest points at.
  const fixture = JSON.parse(readFileSync("fixtures/latest-snapshot.json", "utf8"));
  delete fixture.futures;
  const staleMirror = join(tmpdir(), "milkcompass-e2e-stale-mirror.json");
  writeFileSync(staleMirror, JSON.stringify(fixture));
  seed("latest.json", staleMirror);
  await settle();

  const page = await get("/");
  check(
    "degraded: previous release serves prices when the current one is corrupt",
    page.status === 200 && page.body.includes("$9.50"),
  );
  check(
    "degraded: a stale mirror does not override the manifest",
    page.body.includes("$9.88") && page.body.includes("Contract MKPU27"),
  );
}

function cardSection(page, labelledBy) {
  const match = page.body.match(
    new RegExp(`<article[^>]*aria-labelledby="${labelledBy}"[\\s\\S]*?</article>`),
  );
  return match === null ? "" : match[0];
}

async function degradedMissingFutures() {
  const fixture = JSON.parse(
    readFileSync("fixtures/latest-snapshot.json", "utf8"),
  );
  const { futures, ...officialOnly } = fixture;
  void futures;
  // The futures card ages via the 48-hour-old collectedAt; the official card
  // is kept freshly retrieved so its staleness state stays distinct forever.
  officialOnly.collectedAt = new Date(
    Date.now() - 48 * 3_600_000,
  ).toISOString();
  officialOnly.official.retrievedAt = new Date().toISOString();
  const missing = join(tmpdir(), "milkcompass-e2e-no-futures.json");
  writeFileSync(missing, JSON.stringify(officialOnly));
  // The manifest stays valid, so the degraded snapshot must sit at the key
  // the manifest points at — not just in the legacy mirror.
  const manifest = JSON.parse(readFileSync("fixtures/release/current-release.json", "utf8"));
  seed(manifest.current.snapshotKey, missing);
  seed("latest.json", missing);
  await settle();

  const page = await get("/");
  const futuresCard = cardSection(page, "futures-heading");
  const officialCard = cardSection(page, "official-heading");
  check(
    "degraded: official forecast survives a missing futures block",
    officialCard.includes("$9.50"),
  );
  check(
    "degraded: missing futures block renders its unavailable state",
    futuresCard.includes("Futures reference is unavailable right now."),
  );
  check(
    "degraded: futures card warns about the stale collection check",
    futuresCard.includes("The last check is more than 36 hours old."),
  );
  check(
    "degraded: fresh official check carries no staleness warning",
    officialCard.length > 0 &&
      !officialCard.includes("The last check is more than 36 hours old."),
  );
}

// Strip // and /* */ comments outside string literals so commented-out
// settings can never satisfy the deployment gate.
function parseJsonc(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"') {
        if (text[end] === "\\") end += 1;
        end += 1;
      }
      out += text.slice(i, end + 1);
      i = end + 1;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
    } else if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        i += 1;
      }
      i += 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return JSON.parse(out);
}

// The release fixtures mirror what the collector's publication writes: a
// manifest plus its immutable objects. The snapshot object for the manifest's
// run is byte-identical to that run's mirror, so one file seeds both.
function seedReleaseObjects() {
  const manifest = JSON.parse(readFileSync("fixtures/release/current-release.json", "utf8"));
  seed("current-release.json", "fixtures/release/current-release.json");
  seed(manifest.current.historyKey, "fixtures/release/history.json");
  seed(manifest.current.snapshotKey, "fixtures/latest-snapshot.json");
  const history = JSON.parse(readFileSync("fixtures/release/history.json", "utf8"));
  check(
    "fixtures: manifest keys match its run",
    manifest.current.snapshotKey === `releases/${manifest.season}/${manifest.runId}/snapshot.json` &&
      manifest.current.historyKey === `releases/${manifest.season}/${manifest.runId}/history.json`,
  );
  check(
    "fixtures: history belongs to the manifest season",
    history.season === manifest.season && history.schemaVersion === 1,
  );
}

function deploymentGate() {
  const parserProbe = parseJsonc(
    '{"a": /* enabled */ true, "b": 2, /* c */ "workers_dev": false}',
  );
  check(
    "gate: JSONC parser ignores block and inline comments",
    parserProbe.workers_dev === false && parserProbe.b === 2,
  );
  for (const config of ["wrangler.jsonc", "wrangler.collection.jsonc"]) {
    const parsed = parseJsonc(readFileSync(config, "utf8"));
    check(
      `gate: ${config} keeps workers_dev disabled`,
      parsed.workers_dev === false,
    );
    check(
      `gate: ${config} keeps preview_urls disabled`,
      parsed.preview_urls === false,
    );
  }
}

let preview = null;
let shutdownPromise = null;

// The detached preview must never outlive this script: kill first, wait
// bounded, escalate to SIGKILL. Concurrent callers share one shutdown so a
// second signal or a signal during teardown still waits for the kill.
function shutdown() {
  if (shutdownPromise === null) shutdownPromise = doShutdown();
  return shutdownPromise;
}

async function doShutdown() {
  if (preview === null || preview.pid === undefined) return;
  const pid = preview.pid;
  preview = null;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    return;
  }
  for (let waited = 0; waited < 5000; waited += 200) {
    try {
      process.kill(-pid, 0);
    } catch {
      killOrphanPreview();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // already gone
  }
  killOrphanPreview();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shutdown().then(() => process.exit(130));
  });
}

killOrphanPreview();
seed("latest.json", "fixtures/latest-snapshot.json");
seedReleaseObjects();
console.log("Seeded local R2 with the fixture snapshot and release objects; starting preview…");
preview = spawn("npx", ["opennextjs-cloudflare", "preview"], {
  stdio: "inherit",
  detached: true,
});
try {
  await waitForReady();
  await journey();
  await whatChangedJourney();
  await degradedCorruptSnapshot();
  await degradedPreviousReleaseFallback();
  await degradedMissingFutures();
  deploymentGate();
} finally {
  await shutdown();
  try {
    seed("latest.json", "fixtures/latest-snapshot.json");
    seedReleaseObjects();
  } catch (error) {
    console.error(`Failed to restore the fixture snapshot: ${error}`);
  }
}
console.log(failures === 0 ? "\nAll e2e checks passed." : `\n${failures} e2e check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
