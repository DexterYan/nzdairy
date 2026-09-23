# SPEC — MilkCompass Design Extension

Status: **approved, ready to implement.** Written 2026-09-23 on branch
`design-extension`, after the seeded design pass (`docs/design.md`), an independent
adversarial review (17 findings, folded in), and task breakdown (Tasks 9–12 in
`tasks/todo.md`). The capability map below was approved by the user.

`docs/implementation-plan.md` stays authoritative for product scope. `docs/design.md`
is the visual/interaction source of truth (tokens, component specs, state matrix,
contrast evidence). This file is the **engineering contract**: what gets built, in
what order, under which commands, style, tests, and boundaries. Where this file and
`docs/design.md` disagree, fix the disagreement before writing code.

---

## 1. Objective

Implement the redesigned comparison surface for the MilkCompass page: design tokens
and refined cards (M1), a pure-CSS comparison strip plotting the official forecast
range against the futures reference (M2), stat-tile revenue results (M3), and a
slider + text production input (M4) — for New Zealand Fonterra suppliers reading one
English page, on phones (375px) and desktop.

Non-goals (unchanged from the plan): accounts, database, charts, additional seasons,
alerts, dark mode, marketing surfaces, any new dependency.

The redesign changes presentation and input ergonomics only. Data contracts, season
logic, snapshot schema, and collection behaviour are untouched. Public deployment
remains blocked pending NZX/SGX display rights; all verification runs against local
dev/preview with fixture data.

## 2. Capability map (Phase 0, approved)

```
M1  design-tokens-and-cards      (Task 9)
│   tokens, header band, basis tags, status chips, footer
├─▶ M2  comparison-strip          (Task 10)
│    domain helper + pure-CSS figure
├─▶ M3  revenue-stat-tiles        (Task 11)
│    tile presence state function
│
M2 + M3 ─▶ M4  production-slider  (Task 12)
           write-through interaction + final integrated gate
```

Build order: **M1 → (M2 ∥ M3) → M4.** M2 and M3 touch disjoint files and may run in
parallel sessions; M4 shares `app/revenue-panel.tsx` with M3 and runs the integrated
release gate, so it waits for both.

## 3. Commands

| Command | Purpose |
|---|---|
| `npm run dev` | local dev server (seed first: `npm run seed:snapshot`) |
| `npm run typecheck` / `npm run lint` | static checks |
| `npm test` | Vitest single run (jsdom; `app/**/*.test.tsx` + `tests/**/*.test.ts`) |
| `npm run build` | Next.js production build |
| `npm run build:worker` / `npm run preview` | OpenNext bundle + local Workers preview |
| `npm run test:e2e` | journey + degraded-state checks against the preview |

Gates: M1–M3 each pass `typecheck && lint && test && build`. M4 additionally passes
`build:worker && test:e2e` (the full release gate — M4 is last for this reason).

## 4. Project structure

Existing layout, no new top-level directories:

- `app/` — page, components, colocated `*.test.tsx`, one CSS module (`page.module.css`) plus `globals.css` for tokens.
- `lib/` — pure, DOM-free logic; its tests live in `tests/`. M2 adds `lib/comparison-scale.ts` (domain math only — no React, no CSS).
- `tests/` — logic tests + fixtures.
- `workers/collection`, `fixtures/`, `scripts/e2e.mjs` — untouched by this work.

New files, all four modules: `lib/comparison-scale.ts`, `app/comparison-strip.tsx`,
their two test files. Everything else is edits.

## 5. Code style

- TypeScript strict; CSS Modules with camelCase classes; no inline styles; no new
  dependencies, no charting library — the strip is HTML/CSS geometry.
- Colour/radius/shadow/motion custom properties in `globals.css` per design.md §3;
  components reference tokens, never hardcoded hex. Type ramp and spacing scale are
  literal values in CSS, not custom properties.
- Text never wears a mark colour; identity rides on marks beside ink text
  (design.md §3.1 colour rules are binding).
- Figures: `tabular-nums` only in stacked columns (scenario rows, volume rows);
  large standalone values use proportional figures.
- Native controls only; every interactive element reachable and operable by
  keyboard; `prefers-reduced-motion` disables transitions.
- Comments per repo anti-waffle rule: ≤2 lines, say why (the constraint or trap),
  never restate the code.
- Commit style: conventional, lowercase, one line per fact (see `git log`).

## 6. Testing strategy

Three layers, matching the repo's existing pattern:

1. **Logic units (`tests/`)** — pure functions in `lib/`. M2's domain helper gets
   table-driven tests for every state in design.md §4.3: per-state domains, 2%
   padding, the $0.50 minimum span, never-clamped markers, coincident values,
   no-range, and futures outside the range in both directions.
2. **Component tests (`app/*.test.tsx`)** — Testing Library, behaviour over markup:
   chip predicates and suppression, basis-tag additivity (existing meta lines still
   render), tile presence per state (2 tiles when futures unavailable; guidance-only
   for blank/invalid/overflow; genuine zeros render), slider write-through rules
   (parked default never writes; out-of-range typing parks display only), and
   `aria-invalid`/`aria-describedby` wiring on the production input.
3. **E2E (`scripts/e2e.mjs`)** — M4 adds a slider step to the journey and re-runs
   the degraded-data cases against the Workers preview.

Every module lands with its tests in the same change; no test-less commits. Visual
verification (375px + desktop, label overflow with outliers in both directions,
grayscale legibility of the strip) is a manual gate recorded in each task's
verification checklist.

## 7. Boundaries

**Always:**
- Preserve every piece of information the page shows today; the redesign may add or
  restyle, never drop (basis sentences, volumes/OI, timestamps, source links).
- Keep missing data as guidance text — never fabricated zeros (design.md §5 zeros
  rule: genuine `NZ$0` results render, fabricated ones don't exist).
- Re-evaluate freshness at request time via `freshness()`; chips are independent
  predicates with `Up to date` suppressed under any warning.
- Update page/component test assertions in the same commit as the markup they cover.

**Ask first:**
- Any deviation from design.md's computed tokens or component specs.
- Any new file beyond the four listed in §4, or any change under `workers/`,
  `fixtures/`, `lib/snapshot.ts`, or the snapshot schema.
- Any dependency change (policy: exact pins, deliberate upgrades only).

**Never:**
- Add a charting library, webfont, or any runtime dependency.
- Turn a warning state into silence, or a missing value into a zero.
- Deploy publicly (blocked pending data rights); claim "live" data anywhere.
- Touch Tasks 1–8 scope (parsers, collector, calculator semantics) under this spec.

## 8. Module specs

Acceptance criteria and verification steps per module live in `tasks/todo.md`
(Tasks 9–12, already reviewed); the sections below are the engineering summaries.
Check off tasks in `tasks/todo.md` as modules complete.

### M1 — design-tokens-and-cards (Task 9)

**Files:** `app/globals.css`, `app/page.module.css`, `app/comparison-view.tsx`,
`app/page.test.tsx`.

Contract: custom properties from design.md §3.1/§3.3; header band with season chip;
basis-tag lockup on both cards (short tag `FORECAST` / `MIDPOINT` / `LAST TRADE` /
`PRIOR SETTLE`, purely additive — all existing meta lines survive); status chips per
§4.6 (independent predicates, suppression rule, retention chip carries the failed
check's date, "Checked …" provenance stays plain text); source-credit footer with
mark swatches. Done when the Task 9 gate passes and the dev preview shows the banded
header, tagged cards, and chip states for the fixture snapshot.

### M2 — comparison-strip (Task 10)

**Files:** `lib/comparison-scale.ts` (new), `app/comparison-strip.tsx` (new),
`app/comparison-view.tsx`, `app/page.module.css`, `app/comparison-strip.test.tsx`
(new).

Contract: pure domain helper (`lib/comparison-scale.ts`, DOM-free) implementing the
per-state domain table with 2% padding and the $0.50 minimum span; the component
renders track + decorative wash (`#9db498` composite) + solid boundary ticks at
published low/high (or the two plotted points when no range) + two opposed markers
(official above, futures below, ≥8px with 2px surface rings, `· old quote` suffix
when >72 h); edge-aware label alignment (15% rule); two-item key iff both series;
`role="img"` aria-label sentence; no strip when neither source has data. Done when
the Task 10 gate passes and outliers in both directions show no viewport overflow at
375px.

### M3 — revenue-stat-tiles (Task 11)

**Files:** `app/revenue-panel.tsx`, `app/page.module.css`,
`app/revenue-panel.test.tsx`.

Contract: results `<dl>` becomes the tile grid; tile presence is the state function
from design.md §4.4 (official + sensitivity on valid finite production; futures +
difference additionally require futures ok); delta tile = sign + word + colour;
full-dollar NZD, proportional figures, no compact notation; assumptions sentence
unchanged; guidance replaces tiles for blank/invalid/overflow. Done when the Task 11
gate passes with component tests covering every applicable §5 matrix row.

### M4 — production-slider (Task 12)

**Files:** `app/revenue-panel.tsx`, `app/revenue-panel.test.tsx`, `scripts/e2e.mjs`.

Contract: native range input (20,000–500,000, step 1,000) whose bounds are
interaction bounds only; the text input remains the single source of truth; the §4.5
state table governs thumb and writes (parked default at 150,000 never writes; only
deliberate interaction does; out-of-range typed values stay exactly as typed with
display-only parking); production input gains `aria-invalid`/`aria-describedby`;
slider described with units and its approximate relationship to the text value.
Done when the full release gate (`lint && typecheck && test && build &&
build:worker && test:e2e`) passes with the slider e2e step, closing the extension.
