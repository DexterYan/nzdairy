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
- [ ] Tile presence follows the state table in design.md §4.4: official and sensitivity tiles render for valid, finite production; the futures and difference tiles additionally require futures status ok — so futures-unavailable renders two tiles plus a guidance cell, and blank/invalid/overflow production renders guidance only, no tiles.
- [ ] The difference tile carries sign + word + colour (never colour alone); the "rounds to NZ$0" case keeps its sentence.
- [ ] No zero is fabricated from missing or invalid data; genuine zeros (0 kgMS production, a difference that rounds to zero) render as themselves per design.md §5.
- [ ] Tile values are full-dollar NZD with proportional figures (no `tabular-nums` on tiles, no compact notation); scenario rows keep `tabular-nums`; the assumptions sentence is unchanged; tiles collapse to one column below 45rem.

**Verification:**
- [ ] Extend revenue-panel tests to cover tile markup and every applicable state-matrix row from design.md §5.
- [ ] `npm run typecheck && npm run lint && npm test && npm run build`

**Dependencies:** Task 9

**Files likely touched:** `app/revenue-panel.tsx`, `app/page.module.css`, `app/revenue-panel.test.tsx`

**Estimated scope:** Small

## Checkpoint: Comparison surface redesigned

- [ ] Full gate passes: typecheck, lint, tests, Next.js build.
- [ ] Cards, strip, and tiles match design.md; verify against the seeded spec, not memory.
- [ ] Keyboard-only and reduced-motion paths still work; 375px layout holds.

## Task 12: Add the production slider

**Description:** Vesper-style slider + text pair: a native range input under the production field that writes through to the text input, which remains the single source of truth and keeps the existing validation grammar.

**Acceptance criteria:**
- [ ] Native `<input type="range">` (20,000–500,000 kgMS, step 1,000) with an accessible label renders under the production text field; its bounds are interaction bounds only — typed values outside them (including 0, decimals, and values above 500,000) stay valid and exactly as typed, with only the thumb's display parking at the nearest stop, per the state table in design.md §4.5.
- [ ] Dragging writes the stepped value into the text field; blank or invalid text never receives a write from the parked default (thumb at 150,000 when blank, last valid position when invalid) — only deliberate slider interaction writes.
- [ ] The production text input gains `aria-invalid` and `aria-describedby` to its guidance (closing the existing gap versus scenario inputs), and the slider carries an `aria-describedby` naming its units and approximate relationship to the text value.
- [ ] The keyboard-only journey (tab to slider, arrow keys) still completes; the e2e journey includes a slider step.

**Verification:**
- [ ] Component tests for both write-through directions, the no-write-on-blank/invalid rule, and out-of-range display parking.
- [ ] Full release gate: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:worker && npm run test:e2e`

**Dependencies:** Tasks 10 and 11

**Files likely touched:** `app/revenue-panel.tsx`, `app/revenue-panel.test.tsx`, `scripts/e2e.mjs`

**Estimated scope:** Small

## Checkpoint: Design extension reviewed

- [ ] Every design-extension acceptance criterion and verification step passes.
- [ ] Rendered page matches design.md, including the §3.1 contrast values.
- [ ] Human review of the redesigned page before merging to the release line.
