# Design Extension Tasks (complete)

Source of truth for what these tasks build: [`docs/design.md`](../../docs/design.md)
(seed 668827389 pass). The public-deployment gate in the
[first-release checklist](../first-release/todo.md) is unaffected by this work.

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
