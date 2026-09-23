# Next Release: Market Changes and Farm Impact

Revised after the [Claude review](../../docs/next-release-review.md); governed by
[the next-release plan](../../docs/next-release-plan.md). Prior unchecked launch items
in the [first-release checklist](../first-release/todo.md) remain in force. IDs 13, 15
and 17 are split into focused sub-tasks.

The slice gate is `npm run typecheck`, `npm run lint`, `npm test`, and
`npm run build`. The full gate additionally runs `npm run build:worker` and
`npm run test:e2e`. Any snapshot/collector/reader/fixture change runs the full gate
in that slice. SSR/HTTP checks do not replace real-browser interaction evidence.

## Task 13a: Document source requirements

**Description:** Define fixture-testable field and access requirements without waiting for provider selection.

**Acceptance criteria:**
- [x] Document required MKP fields, effective-time semantics, history needs and unresolved access/display/retention rights; this task can finish with provider choice pending.
- [x] Distinguish current local collection from future production access; do not claim the existing collector is fixture-only.
- [x] Correct the README baseline and link the next-release engineering contract without expanding the completed design-extension SPEC.md.

**Verification:**
- [x] Review the requirements matrix against existing parser fields and confirm public deployment flags remain disabled.

**Dependencies:** None.

**Files likely touched:** `docs/data-rights.md`, `docs/next-release-plan.md`, `README.md`

**Estimated scope:** Small.

## Task 13b: Specify the next-release presentation

**Description:** Write a separate design extension for history, impact and independent context states.

**Acceptance criteria:**
- [x] Create docs/next-release-design.md with layout, SVG/text-table behaviour and empty, stale, basis-changed, source-changed and deferred-context states.
- [x] Keep production state in RevenuePanel; pass validated changes into it and preserve scenarios, validation and local persistence.
- [x] Specify fixture/collected provenance labels and source-specific freshness presentation; preserve existing tokens and accessible controls.

**Verification:**
- [x] Review the design against docs/design.md and this release contract, including 375px layout and text alternatives.

**Dependencies:** None; align with 13a before contract freeze.

**Files likely touched:** `docs/next-release-design.md` (new), `docs/next-release-plan.md`

**Estimated scope:** Small.

## Task 13c: Select and enable the production feed

**Description:** Resolve the commercial/access decision separately from implementation using fixtures.

**Acceptance criteria:**
- [ ] Record selected source, exact contract coverage, timestamp meanings, cost, retention and public-display/derived-output entitlements.
- [ ] Document unresolved limitations and fallback; no new provider production use without access evidence, no public display without display rights.
- [ ] Obtain separate authority for purchases or outreach; a pending decision does not block Tasks 14–18 using fixtures.

**Verification:**
- [ ] Review written entitlement evidence and sample data against 13a; leave this task open if access remains unresolved.

**Dependencies:** 13a; external decisions may remain pending.

**Files likely touched:** `docs/data-rights.md`, `docs/operations.md`

**Estimated scope:** Small, externally dependent.

## Task 14: Define separate release, history and context contracts

**Description:** Keep the legacy v1 snapshot intact and specify versioned companion objects and comparison inputs.

**Acceptance criteria:**
- [x] Define manifest/history/context types, effective-time precision, identity/revision rules, bounded size budgets and the release-loader fallback contract from the plan.
- [x] Preserve legacy latest.json v1 semantics; specify immutable keys, previous-release descriptor, idempotent run IDs, conditional manifest update and provider-specific provenance/retention.
- [x] Test same-price/new-effective-time, identical refetch, revised payload, activity-only row updates, undated settlement exclusion, date-only intervals and no-change announcements.

**Verification:**
- [x] Run contract and v1-reader compatibility tests; verify conditional-write API semantics; add representative companion fixtures and run the full gate.

**Dependencies:** 13a only; no dependency on completed 13c.

**Files likely touched:** `lib/history.ts` (new), `lib/release.ts` (new), `tests/history.test.ts` (new), `tests/release.test.ts` (new), companion fixtures

**Estimated scope:** Medium.

## Task 15a: Extract verified official forecast history

**Description:** Expose current-season priced rows already present in the Fonterra table.

**Acceptance criteria:**
- [x] Validate each historical row, range and footnote; retain published and first-seen dates and show unreadable rows as gaps.
- [x] Preserve current latest-forecast fail-closed behaviour; no-change notices remain events and do not reset the priced-announcement baseline.
- [x] Accept explicitly labelled new-season opening announcements before June 1 without importing the prior season.

**Verification:**
- [x] Fixture tests cover multiple rows, incorrect ranges, unreadable earlier/latest rows, no-change notices and pre-June openings; run the slice gate.

**Dependencies:** 14.

**Files likely touched:** `lib/fonterra.ts`, `tests/fonterra.test.ts`, Fonterra history fixtures

**Estimated scope:** Medium.

## Task 15b: Publish coherent releases and a v1 compatibility mirror

**Description:** Write validated observations, immutable release objects and a manifest while retaining the old reader path.

**Acceptance criteria:**
- [x] Commit immutable snapshot/history before conditional manifest update, then update latest.json as a v1 mirror; test conflicts, retry idempotency, older-run rejection and mirror failures.
- [x] Deduplicate/refine observations, archive only permitted evidence, implement documented expiry cleanup and record replay limits when raw retention is prohibited.
- [x] Test scheduled Auckland rollover with May 31 2027 (2026/27) and June 1 2027 (2027/28): only new-season observations enter the new history and old objects remain unchanged.

**Verification:**
- [x] Inject failures at every write and conflicting runs; update fixture seeding/SSR tests in the same slice and run the full gate. Start restricted scheduled-run observation once access/environment permit.

**Dependencies:** 14 and 15a; production provider use also requires 13c.

**Files likely touched:** `workers/collection/index.ts`, `workers/collection/publish.ts` (new), `tests/collector.test.ts`, `scripts/e2e.mjs`, publication fixtures

**Estimated scope:** Medium; implement any replacement provider adapter as its own field-mapped slice before production use.

## Task 15c: Wire the web release reader and provenance

**Description:** Migrate the page to a manifest-aware reader without making valid current prices depend on history availability.

**Acceptance criteria:**
- [x] Wire app/page.tsx to lib/release.ts: no manifest uses legacy; bad history preserves valid manifest prices; bad snapshot tries previous release then legacy without history.
- [x] Validate matching season/version/object relationships and bounded fallback reads; do not mix versions or fall back to prior-season prices.
- [x] Replace the hardcoded frozen-fixture footer with actual fixture/collected provenance and delayed-data wording; legacy provenance defaults to unknown, never guessed live.

**Verification:**
- [x] Test bootstrap, corrupt/missing manifest/snapshot/history, stale mirror and wrong-season fallback; update SSR fixtures and run the full gate.

**Dependencies:** 15b.

**Files likely touched:** `lib/release.ts`, `tests/release.test.ts`, `app/page.tsx`, `app/comparison-view.tsx`, `scripts/e2e.mjs`

**Estimated scope:** Medium.

## Checkpoint: Publication and reader migration

- [x] Old v1 and new release readers work through bootstrap, corruption, write conflicts, mirror failure and Auckland rollover.
- [ ] Restricted scheduled-run evidence has started when access permits; raw-retention rules and replay limits are recorded.

## Task 16: Calculate comparable historical changes

**Description:** Implement weekly and since-priced-announcement rules as pure functions.

**Acceptance criteria:**
- [x] Use Auckland calendar arithmetic, interval-aware date-only cutoffs, inclusive lookback bounds and actual displayed endpoint dates.
- [x] Select nearest temporal baseline before comparison; suppress basis/provider transitions including A→B→A and reject mismatched contract/unit/currency.
- [x] Allow verified old historical baselines/backfills, but suppress fresh summaries for failed/retained/stale current checks or old effective endpoints; no-change notices do not reset the baseline.

**Verification:**
- [x] Test DST boundaries, date-only last trades, exact cutoffs, insufficient history, backfilled baselines, >72-hour endpoints and transitions; run the slice gate.

**Dependencies:** 14; can precede publication integration using fixtures.

**Files likely touched:** `lib/changes.ts` (new), `tests/changes.test.ts` (new), comparison fixtures

**Estimated scope:** Medium.

## Task 17a: Connect historical changes to farm-revenue sensitivity

**Description:** Add dated movement summaries using the existing production state owner.

**Acceptance criteria:**
- [x] Pass release/history inputs through ComparisonView and validated deltas into RevenuePanel without duplicating raw production state.
- [x] At 150,000 kgMS a $0.20/kgMS delta yields NZ$30,000; cover negative changes, invalid/blank/zero production, overflow and rounded-zero wording.
- [x] Unavailable/incomparable history shows guidance while current values, saved scenarios and exclusions remain intact.

**Verification:**
- [x] Component tests exercise typing and slider updates across both summary periods, degraded history and unchanged scenarios; run the slice gate and SSR degraded scenarios.

**Dependencies:** 13b, 15c and 16.

**Files likely touched:** `app/comparison-view.tsx`, `app/revenue-panel.tsx`, `app/revenue-panel.test.tsx`, `app/page.module.css`, `scripts/e2e.mjs`

**Estimated scope:** Medium.

## Task 17b: Render accessible current-season history

**Description:** Add the chart and its equivalent dated table after the impact flow works.

**Acceptance criteria:**
- [ ] Render forecast announcement steps and verified futures points with native SVG; break lines at basis/provider changes, failed checks and gaps over 72 hours.
- [ ] Provide a text/table equivalent with provenance, actual coverage dates and missing-history guidance; no fabricated daily forecast or trading observations.
- [ ] Meet the approved next-release design at 375px/desktop, including keyboard access, long labels, reduced motion and forecast-range labelling.

**Verification:**
- [ ] Chart component tests cover gaps/revisions/transitions and text equivalence; run the slice gate and record real-browser keyboard/mobile checks separately from SSR tests.

**Dependencies:** 17a and 13b.

**Files likely touched:** `app/history-panel.tsx` (new), `app/history-panel.test.tsx` (new), `app/comparison-view.tsx`, `app/page.module.css`

**Estimated scope:** Medium.

## Task 18: Explain quote quality beside the reference

**Description:** Improve existing quote evidence independently of history implementation.

**Acceptance criteria:**
- [ ] Display available spread, basis, quote/trade timestamps and activity without invented confidence or executable-price claims.
- [ ] Unknown volume remains unknown; old and retained states remain explicit and age at request time.
- [ ] Preserve existing source details and inspect combined history-unavailable and basis/source-change presentation at the core checkpoint.

**Verification:**
- [ ] Component tests cover missing activity, old/retained quotes and spread; run the slice gate and inspect mobile labels.

**Dependencies:** 13b; can precede 16/17, but coordinate edits to ComparisonView.

**Files likely touched:** `app/comparison-view.tsx`, `app/page.module.css`, `app/page.test.tsx`

**Estimated scope:** Small.

## Checkpoint: Core farmer journey

- [ ] 15c, 16, 17a, 17b and 18 are complete regardless of implementation order.
- [ ] Comparable changes drive the existing production input; mobile, keyboard, missing history and quote-quality states pass.

## Task 19: Add dated NZD/USD context

**Description:** Deliver an optional independent FX card through the shared context contract.

**Acceptance criteria:**
- [ ] Use a permitted source with currency direction and effective time; set exact nextExpectedAt/grace rules or explicitly show schedule unknown.
- [ ] Publish/read the separate context object without blocking core release publication; expose overdue, failed-check and missing-data states independently.
- [ ] Show a source-linked factual comparable change only; never convert it directly into a farmgate forecast.

**Verification:**
- [ ] Parser/component tests cover direction, exact freshness boundaries and independent failure; wire fixtures and run the full gate for collector/reader changes.

**Dependencies:** 14, 15c, 13b and source rights; no dependency on 20/21.

**Files likely touched:** `lib/fx.ts` (new), shared context loader/publisher, `app/market-context.tsx` (new), FX/context tests, fixtures

**Estimated scope:** Medium; deliver shared context wiring as a separate slice if first enabled source exceeds five files.

## Task 20: Add monthly milk-collection context

**Description:** Deliver an optional Fonterra NZ collection card independent of FX and GDT.

**Acceptance criteria:**
- [ ] Label Fonterra NZ coverage, period and native unit; compare like periods and preserve revisions.
- [ ] Document exact publication expectations and numeric grace before claiming up-to-date status, or show schedule unknown; test boundary dates.
- [ ] Use the independent context contract; missing collections never suppress other cards or core prices and summaries do not claim causation.

**Verification:**
- [ ] Parser/component tests cover period matching, revisions, units, publication lag and isolated failure; run the full gate for collector/reader changes.

**Dependencies:** 14, 15c, 13b and source rights; no dependency on 19/21.

**Files likely touched:** `lib/milk-collections.ts` (new), shared context loader/publisher, `app/market-context.tsx`, collection/context tests, fixtures

**Estimated scope:** Medium; create shared context wiring first if 19 is deferred.

## Task 21: Add authorised GDT context or record deferral

**Description:** Deliver optional WMP/SMP observations only when their intended external use is covered.

**Acceptance criteria:**
- [ ] Record entitlement evidence or explicit deferral; ordinary subscriber access is not public-display authorisation.
- [ ] Retain event/product/delivery basis, units and dates; compare only compatible observations and keep USD/tonne distinct from NZD/kgMS.
- [ ] Use the independent context contract and exact expected-publication/grace rules or schedule-unknown state; never fabricate unavailable prices.

**Verification:**
- [ ] If included, test product/event/basis matching, threshold boundaries and isolated failure, then run the full gate; if deferred verify no unlicensed data is exposed.

**Dependencies:** 14, 15c, 13b and GDT rights; no dependency on 19/20.

**Files likely touched:** `lib/gdt.ts` (new if included), shared context loader/publisher, `app/market-context.tsx`, GDT/context tests, fixtures

**Estimated scope:** Medium; create shared context wiring first if other cards are deferred.

## Checkpoint: Independent context

- [ ] Each included card has source rights, exact freshness behaviour or schedule-unknown wording, and isolated failure/recovery evidence.
- [ ] Each omitted card is explicitly deferred; no context source blocks core publication or depends on another card.

## Task 22: Verify and prepare the release

**Description:** Collect integrated and operational evidence before public launch.

**Acceptance criteria:**
- [ ] Pass real-browser typing/slider, accessible history and degraded-data journeys at 375px/desktop; record SSR/HTTP checks separately.
- [ ] Record seven consecutive restricted scheduled runs begun after 15b and manifest/mirror rollback evidence; collection/publication changes restart the run, UI-only changes do not.
- [ ] Document rights for all exposed sources, context deferrals, per-context success/recovery checks and outstanding first-release approval gates before public deployment.

**Verification:**
- [ ] Run all six gate commands and record actual browser evidence, operational run scope, provenance labels and season-scoped rollback.

**Dependencies:** Core checkpoint (15c, 16, 17a, 17b, 18); each 19–21 completed or explicitly deferred; applicable rights and prior release gates.

**Files likely touched:** `scripts/e2e.mjs`, `docs/operations.md`, `docs/data-rights.md`, `tasks/next-release/todo.md`, `README.md`

**Estimated scope:** Medium.
