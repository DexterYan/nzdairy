// End-to-end verification against the OpenNext preview on :8787.
// Requires `npm run build && npm run build:worker` first; seeds local R2,
// starts the preview Worker, and exercises the main journey plus degraded
// states over real HTTP against the target runtime.
import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://localhost:8787";
const SNAPSHOT = "milkcompass-snapshots/latest.json";
const WRANGLER_CONFIG = "wrangler.jsonc";

let failures = 0;
function check(name, condition, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  console.log(`${mark} ${name}${condition || !detail ? "" : ` — ${detail}`}`);
  if (!condition) failures += 1;
}

function seed(file) {
  execSync(
    `npx wrangler r2 object put ${SNAPSHOT} --local -c ${WRANGLER_CONFIG} --file ${file} --content-type application/json`,
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
  ]) {
    check(`journey: shows ${JSON.stringify(marker)}`, page.body.includes(marker));
  }

  check(
    "a11y: viewport meta for mobile widths",
    page.body.includes('name="viewport"'),
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

async function degradedCorruptSnapshot() {
  const corrupt = join(tmpdir(), "milkcompass-e2e-corrupt.json");
  writeFileSync(corrupt, "{not json");
  seed(corrupt);

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
}

async function degradedMissingFutures() {
  const fixture = JSON.parse(
    readFileSync("fixtures/latest-snapshot.json", "utf8"),
  );
  const { futures, ...officialOnly } = fixture;
  void futures;
  // Two days before any plausible check time: the 36-hour display rule must fire.
  officialOnly.collectedAt = new Date(
    Date.now() - 48 * 3_600_000,
  ).toISOString();
  const missing = join(tmpdir(), "milkcompass-e2e-no-futures.json");
  writeFileSync(missing, JSON.stringify(officialOnly));
  seed(missing);

  const page = await get("/");
  check(
    "degraded: official forecast survives a missing futures block",
    page.body.includes("$9.50"),
  );
  check(
    "degraded: missing futures block renders its unavailable state",
    page.body.includes("Futures reference is unavailable right now."),
  );
  check(
    "degraded: stale collection check is warned about at request time",
    page.body.includes("The last check is more than 36 hours old."),
  );
}

function deploymentGate() {
  for (const config of ["wrangler.jsonc", "wrangler.collection.jsonc"]) {
    const text = readFileSync(config, "utf8");
    check(
      `gate: ${config} keeps workers_dev disabled`,
      /"workers_dev"\s*:\s*false/.test(text),
    );
    check(
      `gate: ${config} keeps preview_urls disabled`,
      /"preview_urls"\s*:\s*false/.test(text),
    );
  }
}

seed("fixtures/latest-snapshot.json");
console.log("Seeded local R2 with the fixture snapshot; starting preview…");
const preview = spawn("npx", ["opennextjs-cloudflare", "preview"], {
  stdio: "inherit",
  detached: true,
});
try {
  await waitForReady();
  await journey();
  await degradedCorruptSnapshot();
  await degradedMissingFutures();
  deploymentGate();
} finally {
  seed("fixtures/latest-snapshot.json");
  if (preview.pid !== undefined) process.kill(-preview.pid, "SIGTERM");
}
console.log(failures === 0 ? "\nAll e2e checks passed." : `\n${failures} e2e check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
