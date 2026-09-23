# MilkCompass next release: market changes and farm impact

Status: proposed implementation plan. Written 2026-09-24 against `main`
(`4084804`); revised after a `claude -p` review on the same date.
[Review decisions](next-release-review.md) record the changes. This document plans work; it does not authorise purchases, provider
outreach, or public deployment.

## Outcome

A Fonterra supplier can see what changed in the current season's milk-price
references, assess the quality of those observations, and translate comparable
price movements into gross full-season revenue at their own production volume.
A small context panel explains relevant market developments with dated sources.

Success is a complete mobile journey: enter production, inspect a comparable
change, understand its revenue sensitivity, and trace it to the source. For
example, a NZ$0.20/kgMS change at 150,000 kgMS represents NZ$30,000 of gross
full-season revenue sensitivity, not a promised change in payments.

## Baseline and scope

The application already has Fonterra and MKP parsers, a scheduled collector,
private R2 snapshots and parsed-result archives, last-known-good recovery,
freshness warnings, a comparison strip, production input, and editable scenarios.
The README's statement that live integration has not started is stale; operational
readiness must still be verified separately from the presence of code.

The first-release plan and design-extension spec remain the contracts for existing
behaviour. This proposal adds history and market context in a subsequent release;
it does not retroactively change their acceptance criteria. Implementation should
write `docs/next-release-design.md` before changing presentation. This plan is the
next-release engineering contract once approved; `SPEC.md` remains the completed
design-extension contract and is not expanded to cover collector changes.
Tasks 1–12 and their outstanding launch checks remain intact.

**Core release:** permitted source adapters, auditable observations, current-season
history, comparable changes, revenue sensitivity, and clearer quote-quality text.

**Conditional context scope:** NZD/USD, Fonterra milk collections, then GDT WMP/SMP
results, each included only when access and intended reuse are confirmed. A blocked
context source must not delay the core release or become fabricated data.

**Deferred:** proprietary price forecasts, probability bands, automated causal
claims, an AI chat interface, accounts, alerts, multiple-season UI, hedging advice,
profit forecasts, and monthly cash-flow modelling. No new runtime dependency or
database is assumed.

## Data acquisition decisions

| Series | Candidate source | Decision required before production use |
|---|---|---|
| Official season forecast | Existing Fonterra source | Confirm access/reuse basis and retain announcement provenance. |
| Exact season MKP contract | Supported SGX/NZX feed or authorised vendor | Confirm contract coverage, quote fields, history, delay, caching, public display and derived-output rights. |
| NZD/USD | RBNZ B1 downloads | Verify reuse conditions, currency direction, observation time and parsing format. |
| NZ milk collections | Fonterra Global Dairy Update | Confirm coverage is Fonterra NZ collections, period, unit, revisions and reuse basis. |
| WMP/SMP auction results | GDT authorised data service | Confirm product/contract basis and external-display rights; ordinary subscriber access is insufficient evidence. |

Evaluate Vesper as one vendor candidate, not an assumed dependency. Its public API
offering does not establish exact MKP coverage or redistribution permission. Record
the selected provider, recurring cost, entitlement scope and fallback in
`docs/data-rights.md`. Do not assume a paid API subscription permits public display.
No fees or provider SLAs are assumed in this plan.

## Architecture and data rules

Keep the two-Worker architecture and R2. Isolate source adapters from parsing and
presentation. Network requests occur in the collector, not in browser components.

### Compatibility and publication

`readLatestSnapshot` accepts only schemaVersion 1 and drops unknown fields. Keep
`latest.json` in its existing v1 shape, including existing optional fields. Store
new contracts under separate keys and read them with a new release loader. Never
expect new fields to survive the old parser or bump the legacy object's version.

The collector writes immutable `releases/{season}/{runId}/snapshot.json` (v1) and
`history.json`, then publishes `current-release.json` with matching object keys,
season, schema version and the previous successful release descriptor. Only after
that commit does it update the legacy `latest.json` compatibility mirror. A mirror
failure is logged and retried; old readers may lag but retain a valid v1 snapshot.
Readers never combine a manifest snapshot with an independently read legacy history.

The release loader in `lib/release.ts`, wired through `app/page.tsx`, follows these
rules with bounded reads:

- No manifest: use the legacy snapshot and show history unavailable.
- Valid snapshot but missing/corrupt/mismatched history: show that snapshot with
  history unavailable. Do not discard valid current prices because history failed.
- Invalid/missing snapshot: try the manifest's previous release, then the legacy
  snapshot without history. If the manifest itself is invalid, use the legacy path.
- Validate every descriptor, version and season. Fallback data retains its timestamps
  and failure status; no prior-season data is substituted on June 1.

Use one scheduled writer. Retries reuse the run ID and are idempotent. Implement a
conditional manifest update against the version read at run start; on conflict,
re-read and rebuild from committed history rather than losing another run's data.
Verify the storage API's conditional-write semantics in Task 14 before implementation.
An older scheduled run must not replace a newer run. This prevents overlap between
cron, retries and operational runs without assuming storage writes are transactional.

Archive permitted raw evidence with a hash and parser version before publication;
never archive credentials. Record each source's retention duration and implement
and test expiry cleanup (or documented unlimited retention). If raw retention is
not permitted, preserve allowed parsed provenance and declare replay unavailable;
raw replay is not a universal release gate. History materialisation is bounded to
one season, with a budget fixed in Task 14; the page never scans archive keys.

### Observation identity and history coverage

Store series/provider, season/contract or reporting period, value/unit/currency,
basis, source-effective time and precision, publication/retrieval times, parser
version and revision identity. Keep check outcomes separate from observations.

Observation identity is `(series, provider, contract/period, basis, source-effective
instant-or-date)`. Identical canonical price payloads for that identity deduplicate;
a changed payload creates an immutable revision. Same price at a genuinely new
source-effective time is a new observation; a newer retrieval/check alone is not.
Activity-only row changes must not refresh a last trade or settlement's price time.
Use the latest known revision in the display and retain earlier versions for audit;
this release does not claim an as-known-at-the-time backtest.

| Basis | Historical price time |
|---|---|
| Bid/offer midpoint | Provider-verified quote time; a row-update time is eligible only if its price-observation meaning is documented. |
| Last trade | Actual trade time/date, never the row-update time. |
| Prior settlement | Verified settlement session/date; missing session identity makes it ineligible for history. |
| Official forecast | Dated, explicitly season-labelled price announcement; no-change notices are events, not new prices. |

A value that cannot support historical identity may remain in the existing v1
comparison under its existing rules, with history unavailable. Do not silently
reinterpret the current parser's `quotedAt` as a trade or settlement time.

Extend `lib/fonterra.ts` to expose validated current-season priced announcement rows
already present in the source table. Test each row, range and footnote independently;
never apply today's range to old announcements. Preserve unreadable rows as gaps and
the existing latest-forecast failure rules. No-change notices do not reset the
since-announcement baseline. Historical rows discovered today retain their announced
and first-seen dates. Backfill MKP only from verifiable, permitted observations;
otherwise show the actual collection coverage. Retained blocks create no new prices.

### Comparable changes and time rules

All calendar arithmetic resolves in `Pacific/Auckland`, including daylight-saving
boundaries. Date-only observations denote the entire Auckland day, not midnight UTC.
A date-only baseline is eligible only when the entire interval ends at/before the
cutoff; never shift an observation to an earlier day to make it eligible. Ambiguous
source timestamps must remain ineligible until the adapter establishes their meaning.

For “since last week,” anchor to the latest eligible MKP observation (not retrieval
or today's date) and subtract seven Auckland calendar days. If the endpoint is
date-only, anchor the cutoff at the start of its day minus seven days. Select the
latest eligible observation at/before that cutoff, no more than seven calendar days
further back. Show actual endpoint/baseline dates; outside the window show insufficient
history. For “since Fonterra's announcement,” use the latest priced announcement's
instant, or start of its Auckland day if date-only, as the cutoff with the same
lookback tolerance. Same-day observations of unknown time cannot precede that cutoff.

First select the nearest eligible temporal baseline; then require matching series,
provider, contract, currency, unit and basis. Do not search farther back merely to
hide a basis/provider transition. An intervening basis/provider change also suppresses
the delta, even if endpoint bases match. Show “basis changed” or “source changed.”
Keep official forecast revisions separate from futures movements.

Historical eligibility is distinct from request-time freshness:

- A baseline does not become ineligible merely because it is now over 72 hours old.
  Verified historical backfills can qualify even when first retrieved much later.
- A carried-forward block is not a new observation. A genuine verified old trade may
  remain historical evidence, but a new row timestamp cannot make it a fresh endpoint.
- Current quote/check warnings still use the existing 72/36-hour display rules at
  request time. Suppress fresh-change summaries and revenue deltas while the current
  check failed/was retained, the check is stale, or the effective endpoint is over
  72 hours old. Date-only endpoint age uses the start of its day conservatively.
- Plot historic verified observations as dated points; break futures lines across
  basis/provider changes, failed-check intervals or effective-time gaps over 72 hours.
  These visual gaps do not alone invalidate otherwise comparable historical endpoints.
  Forecast steps remain valid between announcements; the forecast range is not a
  probability band. Never draw carried-forward values as fresh trading points.

On June 1, initialise the new season history from only validated new-season data;
it may be empty or contain new-season announcements, never prior-season carry-forward.
Retain old immutable objects for their permitted retention period. Dates before June 1
may legitimately belong to a new-season official opening announcement.

### Context contract

Context uses a separate, optional versioned object and loader; failure never blocks
core publication. The reader verifies each card independently. Each card carries
its own source, period, native unit, last successful check, current failed-check
status, `nextExpectedAt` and source-specific grace interval. Its freshness is based
on overdue publication (`now > nextExpectedAt + grace`) plus independent failed/stale
check indicators, not the futures 72-hour quote rule.

Task 14 defines the shape; Tasks 19–21 must record an exact expected-publication
schedule and numeric grace interval from observed/provider cadence before that card
can claim to be up to date. Test the threshold boundaries. If no reliable schedule is available,
show dated observations with “publication schedule unknown,” never “up to date.”
Do not invent a universal 40-day threshold for monthly reports.

### Farmer-facing presentation

Preserve the current comparison and calculator. Add, in order:

1. A dated change summary and farm-revenue sensitivity using the existing production
   input. Keep raw production state in `RevenuePanel` and pass validated deltas into
   it; mount the sensitivity there rather than introduce a second state owner.
   Blank/invalid production shows guidance; genuine zero remains zero.
2. A compact current-season history chart with a text/table equivalent, distinguishable
   forecast and futures series, and visible gaps. Prefer native SVG and existing CSS.
3. Plain-language quote evidence: age, basis, spread and available activity. Avoid an
   invented confidence score; missing volume is unknown, not zero or “illiquid.”
4. Independently dated context cards and a deterministic, source-linked summary of
   observed changes. No claim that a particular driver caused the farmgate movement.

Context stays in native units. WMP/SMP USD/tonne, NZD/USD and collection volumes are
not converted directly into NZD/kgMS forecasts. Revenue sensitivity excludes GST,
costs, dividends, premiums, deductions and payment timing, as in the existing product.

Preview/source labels must reflect fixture versus collected data. Carry provenance
through the release loader; replace the hardcoded frozen-fixture footer during reader
migration, while preserving explicit delayed-data language.

## Delivery sequence

Tasks 13–22 (with focused sub-tasks) are in [`tasks/next-release/todo.md`](../tasks/next-release/todo.md).

```text
13a Field/access requirements -> 14 Contracts
13b Next-release design -------------------------> 17a Impact UI -> 17b Chart
13c Provider selection/access -> production source use only
14 -> 15a Forecast history -> 15b Publication -> 15c Web reader
14 -> 16 Comparable changes ---------------------> 17a (also needs 15c)
13b -> 18 Quote evidence; integrates with 17b at core checkpoint
Core checkpoint -> optional 19 FX / 20 Collections / 21 GDT -> 22 Release
```

Provider selection runs independently of fixture work and requires separate authority
for any purchase or outreach. Context slices do not depend on each other; implement
shared collector/component edits sequentially. Each may be explicitly deferred.

## Verification and release gates

- Per slice: focused tests, `npm run typecheck`, `npm run lint`, `npm test`, and
  `npm run build`. Contract/publication/reader/fixture changes additionally run
  `npm run build:worker` and `npm run test:e2e` in that slice, with seed and degraded
  fixtures updated alongside it. The existing e2e script tests SSR/HTTP, not browser
  interaction; it cannot certify slider/typing or chart keyboard behaviour.
- Checkpoints follow publication/read migration (15c), the complete core journey
  (17b + 18), and whichever context slices are included. Test old and new publication
  layouts, missing/corrupt references, compatibility-mirror failure, competing runs,
  rollover, raw-retention cleanup and rollback while keeping valid prices usable.
- Task 16 tests same-price/new-time versus refetch, historical backfill age, genuinely
  old current endpoints, date-only trades, no-change announcements, basis transitions
  including A→B→A, provider transitions, exact cutoffs and Auckland DST.
- Tasks 17a/17b test weekly and since-announcement deltas reaching the existing production
  input, overflow/invalid/zero cases, missing history, chart gaps and text alternatives.
  Record actual browser checks at 375px and desktop for keyboard, typing/slider,
  hydration, long labels and reduced motion; automated SSR checks are separate evidence.
- Start seven consecutive restricted scheduled-run observations after Task 15b, once
  collection access is permitted and that environment is provisioned. Task 22 records
  evidence rather than starting the wait. Collection/publication contract changes
  restart this run; UI-only changes do not. Context feeds require their own successful
  source validation and failure/recovery checks, without extending the core soak.
- Final gate reruns all six commands and records the browser journey and rollback.
  Public launch requires documented rights for every exposed dataset and existing
  first-release approval/deployment gates. Publication rollback is season-scoped and
  preserves evidence; old application rollback reads the tested v1 mirror. Mirror
  failure may leave older data, which must keep its original freshness warnings.

## Risks and decisions to close

| Risk | Treatment |
|---|---|
| Feed cost or missing public-display entitlement | Resolve first; keep production blocked and progress with fixtures. |
| Sparse history or thin trading | Show actual dates, gaps and evidence; suppress incomparable deltas. |
| Source revisions or markup changes | Preserve provenance, version parsers and test recovery against archived permitted evidence. |
| Context is mistaken for a payout model | Keep units distinct and explain observations without automatic payout conversion. |
| Existing design becomes crowded | Specify the added layout before implementation; verify the mobile journey. |

Before production, close provider choice/budget, available history depth, raw-data
retention permissions and exact context entitlements. The release can launch with
history accumulated since collection began; it must state that coverage honestly.

## Research references

Reviewed 2026-09-24; provider descriptions are not verified performance guarantees.

- [Vesper data sources](https://vespertool.com/data-and-credibility/)
- [VPI methodology](https://vespertool.com/data-and-credibility/vpi-methodology/)
- [Vesper API](https://vespertool.com/features/api/)
- [GDT Insight and sharing restrictions](https://globaldairytrade.info/en/gdt-insight/)
- [RBNZ statistical file index](https://www.rbnz.govt.nz/statistics/series/data-file-index-page)
- [Fonterra Global Dairy Update](https://www.fonterra.com/nz/en/investors/global-dairy-update.html)
