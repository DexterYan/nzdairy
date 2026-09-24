# Operations

## Running locally

Node 22 and npm; dependencies are pinned (`npm ci` for a clean install).

```bash
npm run seed:snapshot  # seed local R2 (.wrangler/) with the fixture snapshot
npm run dev            # Next dev server (fixture via local R2 after seeding)
npm run preview        # OpenNext Workers preview of the production bundle on :8787
npm run dev:collector  # collection Worker dev server with scheduled testing
npm run test:e2e       # journey + degraded-state checks against the preview
```

`test:e2e` requires `npm run build && npm run build:worker` first. The web
Worker (`wrangler.jsonc`) reads `milkcompass-snapshots/latest.json` from the
local R2 binding; the collector (`wrangler.collection.jsonc`) writes it. To
exercise the scheduled collector locally:

```bash
npm run dev:collector
curl "http://localhost:8788/__scheduled?cron=0+6+*+*+*"   # needs --test-scheduled
```

The collector emits one JSON object per log line: `collector.run.started`,
`collector.source.checked` (per source, with the check outcome),
`collector.archive.written`, `collector.publish.release-written`,
`collector.publish.manifest-updated`, `collector.publish.mirror-failed`,
`collector.archive.cleanup`, and `collector.publish.succeeded` /
`collector.publish.skipped` / `collector.publish.failed`.

## Release publication and retention

Each scheduled run derives its run ID from the scheduled instant
(`YYYYMMDD-HHMMSS`, e.g. `20260923-060000`), so a retried run rewrites the
same keys with the same content instead of forking. Publication order:

1. `releases/{season}/{runId}/snapshot.json` — the run's v1 snapshot (immutable
   once the manifest references it),
2. `releases/{season}/{runId}/history.json` — the season's observations, built
   by merging today's dated announcements and any history-eligible futures
   reference into the committed history (identical refetches are duplicates;
   changed payloads become revisions),
3. `current-release.json` — the manifest, written conditionally (R2 `If-Match`
   on the version read at run start, or `If-None-Match: *` to create). On a
   lost race the run re-reads, rebuilds from the winner's committed history,
   and retries (bounded); a manifest newer than the run ends it as
   `older-run` instead,
4. `latest.json` — the legacy v1 mirror, only after the manifest commit. A
   mirror failure is logged and retried once but never fails the run; old
   readers lag and keep their last valid snapshot.

A new season (1 June Auckland) starts an empty history and a manifest with no
previous descriptor; prior-season objects stay untouched for their retention
period. Log events `collector.publish.skipped` (`older-run`,
`no-valid-official`) and `collector.publish.failed` (`manifest-conflict`)
mark the non-publishing outcomes.

**Archives** hold parsed provenance (`archive/{source}/{instant}.json`), not
raw HTML — raw-retention rights are unconfirmed (see
[Data rights](data-rights.md)), so raw replay is unavailable and recovery
re-parses from the live source. Archives are deleted after 400 days (a season
plus buffer); cleanup lists `archive/` once per run and deletes at most 100
objects, converging over successive runs.

## Data sources and assumptions

- **Official forecast** — Fonterra's farmgate milk price page
  (`FONTERA_SOURCE_URL` in `lib/fonterra.ts`). The parser expects the
  explicitly labelled current season with its range footnotes; the midpoint,
  range, announcement date, and any "no change" update must all be present and
  labelled. A `noChangeUpdate` date never counts as an announcement date.
- **Futures reference** — NZX dairy derivatives MKP quotes page
  (`NZX_SOURCE_URL` in `lib/nzx.ts`). The expected contract code is derived
  from the June–May season (e.g. MKPU27 settles September 2027 for 2026/27);
  substitute seasons are rejected. Basis priority: bid/offer midpoint, then a
  positive last trade with a trade date, then prior settlement. Crossed
  markets, wrong currency, expired contracts, and unverifiable or future quote
  timestamps are rejected.
- **Time rules** — season boundaries resolve in `Pacific/Auckland`; quotes
  older than 72 hours are labelled old and collection checks older than 36
  hours are stale. Both are display rules computed at request time, so
  retained data keeps aging while the collector fails.
- **Fixtures** — `fixtures/latest-snapshot.json` and `tests/fixtures/` stand
  in for live pages in unit tests and for the web tier's local previews.
  **The collector itself always fetches the live URLs on every run** —
  triggering it locally overwrites the seeded fixture in local R2 with live
  results. Parsers are pinned by fixture tests so upstream markup changes
  fail visibly instead of mis-parsing.

## Data-rights gate (deployment blocker)

Public deployment is blocked until NZX/SGX market-data display rights are
documented (see [Data rights](data-rights.md) for the researched licensing
path and current status) — the gate restricts **public display** of NZX market data, not
local collection, which always hits the live sources. `workers_dev` and
`preview_urls` are `false` in both wrangler configs, and `scripts/e2e.mjs`
fails if either flag is re-enabled (including in a commented-out line) before
the rights question is settled. Deployment additionally requires a human
review of the complete release (see the checkpoint in `tasks/first-release/todo.md`).

## Failure handling and rollback

- The collector archives each successful source result under
  `archive/{source}/{instant}.json` **before** publishing `latest.json`, so a
  failed publish never loses fresh data. On partial failure the prior valid
  block is retained with its original timestamps and the failed check is
  recorded in `snapshot.checks`. Without a valid official forecast nothing is
  published. Data never rolls over into a new season.
- The web tier renders a visible unavailable state for a missing, corrupt, or
  invalid snapshot — it never crashes or fabricates prices.
- To roll back code, `git revert` the offending task commit (each task is an
  isolated, self-contained commit) and rebuild. To roll back data, re-put a
  known-good object:
  `npx wrangler r2 object put milkcompass-snapshots/latest.json --local -c wrangler.jsonc --file fixtures/latest-snapshot.json --content-type application/json`.
  Release readers fall back to `latest.json` on a missing/invalid manifest, so
  removing or corrupting `current-release.json` alone cannot take the page
  down; re-putting a prior manifest restores its referenced release objects.

## Provenance

The Fonterra and NZX parsers are adapted from the proof of concept in
`cot-analysis/tools/dairy` (separate repository). Both sources are attributed
on the page through "View official source" / "View NZX quotes" links; any
redistribution of NZX market data is exactly what the data-rights gate
governs.
