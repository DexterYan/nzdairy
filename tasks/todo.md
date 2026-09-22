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
- [ ] Current-season midpoint, low, high, announcement date, and source are parsed when published.
- [ ] Footnote ranges and `No Change` updates are handled explicitly.
- [ ] Invalid or changed markup produces a visible unavailable state rather than fabricated values.

**Verification:**
- [ ] Run parser fixture tests for complete, missing-range, no-change, and malformed documents.
- [ ] Confirm the source-to-page flow in the local Workers preview.

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
- [ ] Only the matching live NZD contract can populate the reference.
- [ ] The chosen basis, bid, offer, available volumes, open interest, and timestamp provenance are visible.
- [ ] Crossed, missing, wrong-season, expired, old, future, and unverifiable quotes have deterministic states.

**Verification:**
- [ ] Run fixtures for midpoint, last trade, settlement, missing quote, crossed market, and invalid timestamps.
- [ ] Inspect normal and warning states in the local preview.

**Dependencies:** Task 3

**Files likely touched:** NZX parser, quote-selection logic, fixtures, comparison component

**Estimated scope:** Medium

## Task 5: Add farm revenue calculations

**Description:** Add expected-production input, official and futures revenue comparison, and +/-$0.50/kgMS sensitivity.

**Acceptance criteria:**
- [ ] Valid production produces correctly formatted gross milk-revenue values.
- [ ] Blank or invalid input shows guidance without misleading results.
- [ ] Assumptions remain adjacent to calculated outputs.

**Verification:**
- [ ] Test 150,000 kgMS at $9.25, $9.80, and +/-$0.50 sensitivity.
- [ ] Check blank, zero, negative, non-finite, and excessive-precision input.

**Dependencies:** Task 4

**Files likely touched:** calculator module, farm input component, calculation tests

**Estimated scope:** Small

## Task 6: Add editable scenarios

**Description:** Populate low, midpoint, and high scenarios from official data while allowing independent edits, per-season local persistence, and reset.

**Acceptance criteria:**
- [ ] Published low/mid/high values initialise the scenarios without overwriting later user edits.
- [ ] Missing range endpoints remain blank and editable.
- [ ] Refresh, reset, season rollover, and unavailable local storage behave predictably.

**Verification:**
- [ ] Run scenario, persistence, reset, rollover, missing-range, and blocked-storage tests.
- [ ] Complete the full calculator flow using only the keyboard.

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
- [ ] The scheduled Worker runs daily at `06:00 UTC` and archives each successful source result.
- [ ] Partial failure retains prior valid data with its original timestamp and exposes the failed check.
- [ ] Fetches have bounded timeouts, one transient retry, and structured operational logs.

**Verification:**
- [ ] Simulate successful, timeout, invalid-source, partial-failure, and repeated scheduled runs.
- [ ] Inspect R2 archive and latest-snapshot objects locally.

**Dependencies:** Task 4

**Files likely touched:** collection Worker, R2 repository, schedule configuration, integration tests

**Estimated scope:** Medium

## Task 8: Verify release readiness

**Description:** Finish responsive styling, accessibility, operational documentation, and complete target-runtime verification.

**Acceptance criteria:**
- [ ] The page works at 375px and desktop widths with visible focus, labels, and text-based warnings.
- [ ] Documentation covers local operation, source assumptions, data-rights gate, and rollback.
- [ ] Public deployment remains blocked until market-data display rights are documented.

**Verification:**
- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run build:worker && npm run test:e2e`
- [ ] Run the main journey and degraded-data cases against the OpenNext preview.

**Dependencies:** Tasks 6 and 7

**Files likely touched:** page styles, browser tests, `README.md`, operations documentation

**Estimated scope:** Medium

## Checkpoint: Ready for review

- [ ] Every task's acceptance criteria and verification steps pass.
- [ ] No task remains larger than a focused implementation session.
- [ ] Source attribution and redistribution status are documented.
- [ ] A human has reviewed the complete release before any public deployment.
