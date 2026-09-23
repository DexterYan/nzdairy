# MilkCompass First Release Tasks

## Task 1: Establish the application toolchain

**Description:** Scaffold the Next.js App Router application with TypeScript, npm scripts, linting, Vitest, and a minimal English page.

**Acceptance criteria:**
- [x] The application starts locally and renders a semantic page shell.
- [x] Type checking, linting, tests, and the Next.js build have explicit scripts.
- [x] Dependency and generated-file policies are documented.

**Verification:**
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test`
- [x] `npm run build`

**Dependencies:** None

**Files likely touched:** `package.json`, `app/layout.tsx`, `app/page.tsx`, tool configuration files

**Estimated scope:** Medium

## Task 2: Establish the Cloudflare runtime

**Description:** Configure OpenNext, the web Worker, a separate collection Worker, and local R2 bindings. Render the comparison layout from a fixture snapshot.

**Acceptance criteria:**
- [x] The OpenNext production bundle builds successfully.
- [x] Both Workers start locally with the expected bindings.
- [x] The page renders fixture values through the same boundary planned for R2 data.

**Verification:**
- [x] `npm run build:worker`
- [x] Start the local Workers preview and inspect the fixture-backed page.

**Dependencies:** Task 1

**Files likely touched:** `wrangler.jsonc`, `open-next.config.ts`, Worker entrypoint, snapshot fixture

**Estimated scope:** Medium

## Task 3: Connect the official Fonterra forecast

**Description:** Adapt the existing Fonterra parser, validate the current season and published range, and display its values with source provenance.

**Acceptance criteria:**
- [x] Current-season midpoint, low, high, announcement date, and source are parsed when published.
- [x] Footnote ranges and `No Change` updates are handled explicitly.
- [x] Invalid or changed markup produces a visible unavailable state rather than fabricated values.

**Verification:**
- [x] Run parser fixture tests for complete, missing-range, no-change, and malformed documents.
- [x] Confirm the source-to-page flow in the local Workers preview.

**Dependencies:** Task 2

**Files likely touched:** Fonterra parser, snapshot schema, parser fixtures, forecast display component

**Estimated scope:** Medium

## Checkpoint: Forecast foundation

- [ ] All checks pass and the OpenNext bundle builds.
- [ ] The official forecast reaches the page with correct season and provenance.
- [ ] Review the rendered comparison layout before adding futures data.

## Task 4: Connect the futures reference

**Description:** Adapt MKP extraction, match the exact current-season contract, select a defensible reference value, and display quote-quality indicators.

**Acceptance criteria:**
- [x] Only the matching live NZD contract can populate the reference.
- [x] The chosen basis, bid, offer, available volumes, open interest, and timestamp provenance are visible.
- [x] Crossed, missing, wrong-season, expired, old, future, and unverifiable quotes have deterministic states.

**Verification:**
- [x] Run fixtures for midpoint, last trade, settlement, missing quote, crossed market, and invalid timestamps.
- [x] Inspect normal and warning states in the local preview.

**Dependencies:** Task 3

**Files likely touched:** NZX parser, quote-selection logic, fixtures, comparison component

**Estimated scope:** Medium

## Task 5: Add farm revenue calculations

**Description:** Add expected-production input, official and futures revenue comparison, and +/-$0.50/kgMS sensitivity.

**Acceptance criteria:**
- [x] Valid production produces correctly formatted gross milk-revenue values.
- [x] Blank or invalid input shows guidance without misleading results.
- [x] Assumptions remain adjacent to calculated outputs.

**Verification:**
- [x] Test 150,000 kgMS at $9.25, $9.80, and +/-$0.50 sensitivity.
- [x] Check blank, zero, negative, non-finite, and excessive-precision input.

**Dependencies:** Task 4

**Files likely touched:** calculator module, farm input component, calculation tests

**Estimated scope:** Small

## Task 6: Add editable scenarios

**Description:** Populate low, midpoint, and high scenarios from official data while allowing independent edits, per-season local persistence, and reset.

**Acceptance criteria:**
- [x] Published low/mid/high values initialise the scenarios without overwriting later user edits.
- [x] Missing range endpoints remain blank and editable.
- [x] Refresh, reset, season rollover, and unavailable local storage behave predictably.

**Verification:**
- [x] Run scenario, persistence, reset, rollover, missing-range, and blocked-storage tests.
- [x] Complete the full calculator flow using only the keyboard.

**Dependencies:** Task 5

**Files likely touched:** scenario component, persistence helper, scenario tests

**Estimated scope:** Medium

## Checkpoint: Complete user flow

- [ ] A supplier can compare references, enter production, and edit scenarios end to end.
- [ ] Calculations match the acceptance examples in the implementation plan.
- [ ] Mobile and desktop layouts remain understandable.

## Task 7: Automate snapshot publication

**Description:** Enable daily collection, timestamped archival, partial-failure handling, and publication of the latest combined snapshot.

**Acceptance criteria:**
- [x] The scheduled Worker runs daily at `06:00 UTC` and archives each successful source result.
- [x] Partial failure retains prior valid data with its original timestamp and exposes the failed check.
- [x] Fetches have bounded timeouts, one transient retry, and structured operational logs.

**Verification:**
- [x] Simulate successful, timeout, invalid-source, partial-failure, and repeated scheduled runs.
- [x] Inspect R2 archive and latest-snapshot objects locally.

**Dependencies:** Task 4

**Files likely touched:** collection Worker, R2 repository, schedule configuration, integration tests

**Estimated scope:** Medium

## Task 8: Verify release readiness

**Description:** Finish responsive styling, accessibility, operational documentation, and complete target-runtime verification.

**Acceptance criteria:**
- [x] The page works at 375px and desktop widths with visible focus, labels, and text-based warnings.
- [x] Documentation covers local operation, source assumptions, data-rights gate, and rollback.
- [x] Public deployment remains blocked until market-data display rights are documented.

**Verification:**
- [x] `npm run lint && npm run typecheck && npm test && npm run build && npm run build:worker && npm run test:e2e`
- [x] Run the main journey and degraded-data cases against the OpenNext preview.

**Dependencies:** Tasks 6 and 7

**Files likely touched:** page styles, browser tests, `README.md`, operations documentation

**Estimated scope:** Medium

## Checkpoint: Ready for review

- [x] Every task's acceptance criteria and verification steps pass.
- [x] No task remains larger than a focused implementation session.
- [x] Source attribution and redistribution status are documented.
- [ ] A human has reviewed the complete release before any public deployment.

---

# Design Extension Tasks

Source of truth for what these tasks build: [`docs/design.md`](../docs/design.md)
(seed 668827389 pass). The public-deployment gate above is unaffected by this work.

## Task 9: Adopt design tokens and card refinements

**Description:** Introduce the `docs/design.md` §3 custom properties in `globals.css`, then apply them to the existing cards: tinted header band with season chip, basis-tag price lockups, status chips for collection/age states, and the source-credit footer.

**Acceptance criteria:**
- [x] `app/globals.css` defines every colour, radius, shadow, and motion custom property from design.md §3 with the specified values (type ramp and spacing scale are applied directly in CSS, not as custom properties); colours in `page.module.css` reference tokens instead of hardcoded hex.
- [x] Both cards show the price lockup with a basis tag: `FORECAST` on the official card; `MIDPOINT`, `LAST TRADE`, or `PRIOR SETTLE` on the futures card per the snapshot's selected basis. The tag is additive — every meta line rendered today (basis sentence, contract/expiry, volumes/OI, quoted time, check provenance, source link) survives unchanged.
- [x] Collection/age states render as chips per design.md §4.6: independent predicates, `● Up to date` suppressed when any warning chip applies, and the retention chip text carries the failed check's date. "Checked …" provenance stays plain meta text; no "live" claims anywhere.
- [x] Header band, season chip, and source-credit footer render with the official-green / futures-blue mark vocabulary.

**Verification:**
- [x] Update page-level test assertions for the new markup; `npm run typecheck && npm run lint && npm test && npm run build`
- [x] Inspect the dev server at 375px and desktop widths: band, chips, tags, footer, and focus outlines.

**Dependencies:** Task 8

**Files likely touched:** `app/globals.css`, `app/page.module.css`, `app/comparison-view.tsx`, `app/page.test.tsx`

**Estimated scope:** Medium

## Task 10: Render the comparison strip

**Description:** New pure-CSS figure under the comparison cards plotting the official low–mid–high range and the futures price on one padded domain, with opposed direct labels, a two-item key, and an accessible sentence. No charting library — HTML/CSS geometry only.

**Acceptance criteria:**
- [x] Domain follows the per-state table in design.md §4.3 (range+futures / range only / no-range two-dot / no strip), padded 2% per side with a **minimum span of $0.50** centred on the extremes, so equal prices never collapse the track; markers are never clamped.
- [x] Solid boundary ticks in official green (≥3:1) sit at the published low and high — or at the two plotted values in the no-range state — and their labels are those tick values; the padded domain ends are never ticked or labeled.
- [x] Official marker and label sit above the track, futures below — always, including coincident values; markers are ≥8px with a 2px surface ring; labels carry name + value, appending `· old quote` to the futures label when the quote is >72 h.
- [x] Labels use edge-aware alignment (15% rule, design.md §4.3), tested with the futures marker outside the range in both directions at 375px without viewport overflow.
- [x] The two-item key renders whenever both series show; official-only renders without a key; the range extent reads through the boundary ticks in grayscale (the wash is decorative, composite `#9db498`).
- [x] The figure carries `role="img"` with an aria-label sentence carrying the actual values; the same numbers remain in the cards' text.

**Verification:**
- [x] Unit tests for the domain helper (padding, out-of-range futures, coincident values, degenerate inputs) and rendering tests for each degenerate state.
- [x] `npm run typecheck && npm run lint && npm test && npm run build`
- [x] Visual check at 375px and desktop for label collisions and overflow.

**Dependencies:** Task 9

**Files likely touched:** `lib/comparison-scale.ts` (new), `app/comparison-strip.tsx` (new), `app/comparison-view.tsx`, `app/page.module.css`, `app/comparison-strip.test.tsx` (new)

**Estimated scope:** Medium

## Task 11: Convert revenue results to stat tiles

**Description:** Replace the results definition list with the tile grid from design.md §4.4 — sentence-case label, value, sub-caption — including the signed difference tile. Full-dollar figures are retained; the assumptions sentence is the rounding contract and stays unchanged.

**Acceptance criteria:**
- [x] Tile presence follows the state table in design.md §4.4: official and sensitivity tiles render for valid, finite production; the futures and difference tiles additionally require futures status ok — so futures-unavailable renders two tiles plus a guidance cell, and blank/invalid/overflow production renders guidance only, no tiles.
- [x] The difference tile carries sign + word + colour (never colour alone); the "rounds to NZ$0" case keeps its sentence.
- [x] No zero is fabricated from missing or invalid data; genuine zeros (0 kgMS production, a difference that rounds to zero) render as themselves per design.md §5.
- [x] Tile values are full-dollar NZD with proportional figures (no `tabular-nums` on tiles, no compact notation); scenario rows keep `tabular-nums`; the assumptions sentence is unchanged; tiles collapse to one column below 45rem.

**Verification:**
- [x] Extend revenue-panel tests to cover tile markup and every applicable state-matrix row from design.md §5.
- [x] `npm run typecheck && npm run lint && npm test && npm run build`

**Dependencies:** Task 9

**Files likely touched:** `app/revenue-panel.tsx`, `app/page.module.css`, `app/revenue-panel.test.tsx`

**Estimated scope:** Small

## Checkpoint: Comparison surface redesigned

- [x] Full gate passes: typecheck, lint, tests, Next.js build.
- [x] Cards, strip, and tiles match design.md; verify against the seeded spec, not memory.
- [x] Keyboard-only and reduced-motion paths still work; 375px layout holds.

## Task 12: Add the production slider

**Description:** Vesper-style slider + text pair: a native range input under the production field that writes through to the text input, which remains the single source of truth and keeps the existing validation grammar.

**Acceptance criteria:**
- [x] Native `<input type="range">` (20,000–500,000 kgMS, step 1,000) with an accessible label renders under the production text field; its bounds are interaction bounds only — typed values outside them (including 0, decimals, and values above 500,000) stay valid and exactly as typed, with only the thumb's display parking at the nearest stop, per the state table in design.md §4.5.
- [x] Dragging writes the stepped value into the text field; blank or invalid text never receives a write from the parked default (thumb at 150,000 when blank, last valid position when invalid) — only deliberate slider interaction writes.
- [x] The production text input gains `aria-invalid` and `aria-describedby` to its guidance (closing the existing gap versus scenario inputs), and the slider carries an `aria-describedby` naming its units and approximate relationship to the text value.
- [x] The keyboard-only journey (tab to slider, arrow keys) still completes; the e2e journey includes a slider step.

**Verification:**
- [x] Component tests for both write-through directions, the no-write-on-blank/invalid rule, and out-of-range display parking.
- [x] Full release gate: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:worker && npm run test:e2e`

**Dependencies:** Tasks 10 and 11

**Files likely touched:** `app/revenue-panel.tsx`, `app/revenue-panel.test.tsx`, `scripts/e2e.mjs`

**Estimated scope:** Small

## Checkpoint: Design extension reviewed

- [x] Every design-extension acceptance criterion and verification step passes.
- [x] Rendered page matches design.md, including the §3.1 contrast values.
- [x] Human review of the redesigned page before merging to the release line.


# Next Release: Market Changes and Farm Impact

Revised after the [Claude review](../docs/next-release-review.md); governed by
[the next-release plan](../docs/next-release-plan.md). Prior unchecked launch items
remain in force. IDs 13, 15 and 17 are split into focused sub-tasks.

The slice gate is `npm run typecheck`, `npm run lint`, `npm test`, and
`npm run build`. The full gate additionally runs `npm run build:worker` and
`npm run test:e2e`. Any snapshot/collector/reader/fixture change runs the full gate
in that slice. SSR/HTTP checks do not replace real-browser interaction evidence.

## Task 13a: Document source requirements

**Description:** Define fixture-testable field and access requirements without waiting for provider selection.

**Acceptance criteria:**
- [ ] Document required MKP fields, effective-time semantics, history needs and unresolved access/display/retention rights; this task can finish with provider choice pending.
- [ ] Distinguish current local collection from future production access; do not claim the existing collector is fixture-only.
- [ ] Correct the README baseline and link the next-release engineering contract without expanding the completed design-extension SPEC.md.

**Verification:**
- [ ] Review the requirements matrix against existing parser fields and confirm public deployment flags remain disabled.

**Dependencies:** None.

**Files likely touched:** `docs/data-rights.md`, `docs/next-release-plan.md`, `README.md`

**Estimated scope:** Small.

## Task 13b: Specify the next-release presentation

**Description:** Write a separate design extension for history, impact and independent context states.

**Acceptance criteria:**
- [ ] Create docs/next-release-design.md with layout, SVG/text-table behaviour and empty, stale, basis-changed, source-changed and deferred-context states.
- [ ] Keep production state in RevenuePanel; pass validated changes into it and preserve scenarios, validation and local persistence.
- [ ] Specify fixture/collected provenance labels and source-specific freshness presentation; preserve existing tokens and accessible controls.

**Verification:**
- [ ] Review the design against docs/design.md and this release contract, including 375px layout and text alternatives.

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
- [ ] Define manifest/history/context types, effective-time precision, identity/revision rules, bounded size budgets and the release-loader fallback contract from the plan.
- [ ] Preserve legacy latest.json v1 semantics; specify immutable keys, previous-release descriptor, idempotent run IDs, conditional manifest update and provider-specific provenance/retention.
- [ ] Test same-price/new-effective-time, identical refetch, revised payload, activity-only row updates, undated settlement exclusion, date-only intervals and no-change announcements.

**Verification:**
- [ ] Run contract and v1-reader compatibility tests; verify conditional-write API semantics; add representative companion fixtures and run the full gate.

**Dependencies:** 13a only; no dependency on completed 13c.

**Files likely touched:** `lib/history.ts` (new), `lib/release.ts` (new), `tests/history.test.ts` (new), `tests/release.test.ts` (new), companion fixtures

**Estimated scope:** Medium.

## Task 15a: Extract verified official forecast history

**Description:** Expose current-season priced rows already present in the Fonterra table.

**Acceptance criteria:**
- [ ] Validate each historical row, range and footnote; retain published and first-seen dates and show unreadable rows as gaps.
- [ ] Preserve current latest-forecast fail-closed behaviour; no-change notices remain events and do not reset the priced-announcement baseline.
- [ ] Accept explicitly labelled new-season opening announcements before June 1 without importing the prior season.

**Verification:**
- [ ] Fixture tests cover multiple rows, incorrect ranges, unreadable earlier/latest rows, no-change notices and pre-June openings; run the slice gate.

**Dependencies:** 14.

**Files likely touched:** `lib/fonterra.ts`, `tests/fonterra.test.ts`, Fonterra history fixtures

**Estimated scope:** Medium.

## Task 15b: Publish coherent releases and a v1 compatibility mirror

**Description:** Write validated observations, immutable release objects and a manifest while retaining the old reader path.

**Acceptance criteria:**
- [ ] Commit immutable snapshot/history before conditional manifest update, then update latest.json as a v1 mirror; test conflicts, retry idempotency, older-run rejection and mirror failures.
- [ ] Deduplicate/refine observations, archive only permitted evidence, implement documented expiry cleanup and record replay limits when raw retention is prohibited.
- [ ] Test scheduled Auckland rollover with May 31 2027 (2026/27) and June 1 2027 (2027/28): only new-season observations enter the new history and old objects remain unchanged.

**Verification:**
- [ ] Inject failures at every write and conflicting runs; update fixture seeding/SSR tests in the same slice and run the full gate. Start restricted scheduled-run observation once access/environment permit.

**Dependencies:** 14 and 15a; production provider use also requires 13c.

**Files likely touched:** `workers/collection/index.ts`, `workers/collection/publish.ts` (new), `tests/collector.test.ts`, `scripts/e2e.mjs`, publication fixtures

**Estimated scope:** Medium; implement any replacement provider adapter as its own field-mapped slice before production use.

## Task 15c: Wire the web release reader and provenance

**Description:** Migrate the page to a manifest-aware reader without making valid current prices depend on history availability.

**Acceptance criteria:**
- [ ] Wire app/page.tsx to lib/release.ts: no manifest uses legacy; bad history preserves valid manifest prices; bad snapshot tries previous release then legacy without history.
- [ ] Validate matching season/version/object relationships and bounded fallback reads; do not mix versions or fall back to prior-season prices.
- [ ] Replace the hardcoded frozen-fixture footer with actual fixture/collected provenance and delayed-data wording; legacy provenance defaults to unknown, never guessed live.

**Verification:**
- [ ] Test bootstrap, corrupt/missing manifest/snapshot/history, stale mirror and wrong-season fallback; update SSR fixtures and run the full gate.

**Dependencies:** 15b.

**Files likely touched:** `lib/release.ts`, `tests/release.test.ts`, `app/page.tsx`, `app/comparison-view.tsx`, `scripts/e2e.mjs`

**Estimated scope:** Medium.

## Checkpoint: Publication and reader migration

- [ ] Old v1 and new release readers work through bootstrap, corruption, write conflicts, mirror failure and Auckland rollover.
- [ ] Restricted scheduled-run evidence has started when access permits; raw-retention rules and replay limits are recorded.

## Task 16: Calculate comparable historical changes

**Description:** Implement weekly and since-priced-announcement rules as pure functions.

**Acceptance criteria:**
- [ ] Use Auckland calendar arithmetic, interval-aware date-only cutoffs, inclusive lookback bounds and actual displayed endpoint dates.
- [ ] Select nearest temporal baseline before comparison; suppress basis/provider transitions including A→B→A and reject mismatched contract/unit/currency.
- [ ] Allow verified old historical baselines/backfills, but suppress fresh summaries for failed/retained/stale current checks or old effective endpoints; no-change notices do not reset the baseline.

**Verification:**
- [ ] Test DST boundaries, date-only last trades, exact cutoffs, insufficient history, backfilled baselines, >72-hour endpoints and transitions; run the slice gate.

**Dependencies:** 14; can precede publication integration using fixtures.

**Files likely touched:** `lib/changes.ts` (new), `tests/changes.test.ts` (new), comparison fixtures

**Estimated scope:** Medium.

## Task 17a: Connect historical changes to farm-revenue sensitivity

**Description:** Add dated movement summaries using the existing production state owner.

**Acceptance criteria:**
- [ ] Pass release/history inputs through ComparisonView and validated deltas into RevenuePanel without duplicating raw production state.
- [ ] At 150,000 kgMS a $0.20/kgMS delta yields NZ$30,000; cover negative changes, invalid/blank/zero production, overflow and rounded-zero wording.
- [ ] Unavailable/incomparable history shows guidance while current values, saved scenarios and exclusions remain intact.

**Verification:**
- [ ] Component tests exercise typing and slider updates across both summary periods, degraded history and unchanged scenarios; run the slice gate and SSR degraded scenarios.

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

**Files likely touched:** `scripts/e2e.mjs`, `docs/operations.md`, `docs/data-rights.md`, `tasks/todo.md`, `README.md`

**Estimated scope:** Medium.
