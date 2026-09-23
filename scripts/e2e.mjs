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
  seed(missing);

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
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // already gone
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shutdown().then(() => process.exit(130));
  });
}

seed("fixtures/latest-snapshot.json");
console.log("Seeded local R2 with the fixture snapshot; starting preview…");
preview = spawn("npx", ["opennextjs-cloudflare", "preview"], {
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
  await shutdown();
  try {
    seed("fixtures/latest-snapshot.json");
  } catch (error) {
    console.error(`Failed to restore the fixture snapshot: ${error}`);
  }
}
console.log(failures === 0 ? "\nAll e2e checks passed." : `\n${failures} e2e check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
