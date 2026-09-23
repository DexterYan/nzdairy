# MilkCompass UI Design Extension

Status: **design proposal — not implemented.** Derived from a design-language study of
Vesper Tool's [SMP calculator](https://vespertool.com/calculators/dairy/smp/) and
[homepage](https://vespertool.com/), extended through a seeded decision procedure
(random seed below), then revised after an independent adversarial review (17 findings,
2026-09-23 — all triaged into this revision). Any implementation goes through
`tasks/design-extension/todo.md` (Tasks 9–12); this document is the visual/interaction contract for
that work.

Author context: designer pass over the layout-only preview built in Task 1.
`docs/implementation-plan.md` remains authoritative for product scope; where design
and plan conflict, the plan wins.

---

## 1. The seed

Seed generated for this pass: **668827389**. Its digits drive nine enumerated design
decisions — each slot below had ten designer-authored options (0–9) written before the
seed was drawn; the digit selects. This keeps the extension exploratory but traceable.

Digits: `6 6 8 8 2 7 3 8 9`

| # | Slot | Digit | Selected direction |
|---|------|-------|--------------------|
| 1 | Accent strategy | 6 | Complementary pair: green marks = official, futures = blue. Text stays ink. |
| 2 | Surface treatment | 6 | Outlined cards at rest; soft shadow + border shift on hover/focus-within. |
| 3 | Numeric hierarchy | 8 | Value + unit + basis tag lockup (Vesper's "fat-credit method" tag pattern). |
| 4 | Range visualisation | 8 | Pure-CSS comparison strip: official low–mid–high track with a futures marker on the same scale. |
| 5 | Motion | 2 | 150 ms ease-out micro-transitions on hover/focus only; `prefers-reduced-motion` respected. |
| 6 | Freshness system | 7 | Status chips with filled dot: "Up to date", "Showing previous value", "Last check stale", "Quote old". |
| 7 | Calculator input | 3 | Vesper calculator pattern: native slider + editable text pair for production. Scenario prices stay text-only. |
| 8 | Results presentation | 8 | Stat-tile row: label · value · signed delta tile (colour + sign + word, never colour alone). |
| 9 | Page structure | 9 | Wide tinted header band, single-column content, structured source-credit footer. |

The seed landed on a coherent story: **keep the paper-and-ink restraint, spend the new
budget on making the two-source comparison legible at a glance.**

---

## 2. What Vesper does (audit), and what we take

Observed on the two pages:

| Vesper pattern | Verdict for MilkCompass |
|---|---|
| Calculator cards: labelled input groups, slider + numeric pair, method tag beside the result | **Adopt** (slots 3, 7). The slider/text pair is their strongest transferable idea — direct manipulation with a precise fallback. |
| Result lockup: big value, small unit, method pill, sub-metric rows | **Adopt** (slot 8) as stat tiles. |
| Status/pill vocabulary ("Live prices", badges, dots) | **Adopt** (slot 6) — translated to our data-quality states rather than marketing claims. We never say "live"; we say what was checked and when. |
| Price rows with delta chips (+/− %, colour-coded) | **Adopt** for the revenue difference (signed + word + colour). |
| Deep navy `#030C38` brand, dark footer, white-logo lockup | **Reject.** Their brand, not ours; and a dark surface would invalidate our computed ink ratios. |
| Mega-nav, logo walls, trial CTAs, cookie wall, AI upsell bands | **Reject.** We are one page, no accounts, no marketing funnel. |
| Charts and mini-graphs | **Reject** for release 1 — no charting library (plan constraint). The comparison strip is HTML/CSS geometry, zero dependencies. |
| Multi-step "How the calculation works" FAQ accordion | **Defer.** Good pattern for the assumptions block later; not part of this extension. |

Design temperament worth copying even where we take no component: Vesper's calculator
page answers *what do I get* in the first viewport, labels every number with its unit
and method, and never shows a bare number without provenance. That is already
MilkCompass's data contract; the UI should make it visible.

---

## 3. Design tokens

No preprocessor, no dependency: colour/radius/shadow/motion live as CSS custom
properties in `:root` (`app/globals.css`); CSS Modules keep consuming them. The type
ramp and spacing scale below are **documented values applied directly in CSS**, not
custom properties — they'd otherwise be a parallel indirection with one consumer each.

### 3.1 Colour

Existing tokens are formalised, not changed. New tokens are **mark colours**
(decorative identity: markers, chips, deltas) and **tints** (chip/band backgrounds).

| Token | Value | Role | Verified contrast |
|---|---|---|---|
| `--color-ink` | `#1e3a2f` | body text | 11.64:1 on paper ✓ |
| `--color-ink-soft` | `#4c6357` | meta text | 6.50:1 on white ✓ |
| `--color-paper` | `#faf8f4` | page background | — |
| `--color-card` | `#ffffff` | card surface | — |
| `--color-line` | `#d8d2c4` | hairlines, card borders, strip track | 1.54:1 (border, non-text ok) |
| `--color-focus` | `#2f5d3f` | focus outline (unchanged) | 7.61:1 on white ✓ |
| `--color-warn-text` | `#8a5a00` | warning text (unchanged) | 5.93:1 on white ✓ |
| `--color-mark-official` | `#2e7d46` | **new** official marks | 5.07:1 on white ✓ (≥3:1 non-text) |
| `--color-mark-futures` | `#2563a8` | **new** futures marks | 6.12:1 on white ✓ |
| `--color-delta-up` | `#1e6b3a` | **new** signed gain text | 6.52:1 on white ✓ |
| `--color-delta-down` | `#a72e1f` | **new** signed loss text | 6.88:1 on white ✓ |
| `--tint-official` | `#e9f2ea` | **new** green chip fill | text `#24512f` 8.00:1 ✓ |
| `--tint-futures` | `#e7eef8` | **new** blue chip fill | text `#1d4368` 8.75:1 ✓ |
| `--tint-warn` | `#faf0d7` | **new** amber chip fill | text `#6b4700` 7.33:1 ✓ |
| `--tint-band` | `#eef0e6` | **new** header band | ink 10.72:1 ✓ |

The mark pair `#2e7d46` / `#2563a8` passed the full six-check categorical validation
(lightness band, chroma floor, CVD separation, normal-vision floor, surface contrast).
The existing muted `#2f5d3f` deliberately stays for focus rings and is *not* used as a
mark — it fails the chroma floor (reads gray beside the blue).

**Colour rules (binding):**

- Text never wears a mark colour. Identity comes from a coloured mark *beside* ink
  text: a dot, a chip swatch, a marker. Exceptions are the delta texts, which are
  text but always carry a sign and a direction word, never colour alone.
- Status ambers are reserved for data-quality states and never decorate nav or
  marketing surfaces (we have neither).
- Colour follows the entity: official = green, futures = blue, everywhere, in every
  state. A state change never repaints the entity colour.
- **Contrast scope:** the ≥3:1 non-text guarantee covers markers, key swatches,
  boundary ticks, and focus outlines. The strip's range fill is a decorative *wash*
  (35% `--color-mark-official` over `--color-line` composites to `#9db498`, 1.48:1
  vs the track — deliberately exempt, like a 10% area fill); the range **extent**
  survives grayscale/CVD through the solid boundary ticks, not the wash.

### 3.2 Type

System stack unchanged (no webfont — a brand face would be a new dependency and a
perf cost the plan doesn't authorise). Ramp:

| Rule | Value |
|---|---|
| h1 | `clamp(1.5rem, 5vw, 2.25rem)` (existing) |
| Card prices | `2.25rem`, weight 700 (existing) |
| Stat-tile values | `1.375rem`, weight 600 — **proportional figures**, no `tabular-nums` |
| Body/meta | `0.9375rem`–`1.0625rem` (existing) |
| Chips/tags | `0.75rem`, weight 600, `letter-spacing 0.04em` |

Figure rule: `tabular-nums` only where numbers stack in columns (scenario rows,
volume/OI rows). Large standalone values use the font's proportional figures — `121`
in tabular digits reads loose at display sizes. This *refines* today's blanket
`tabular-nums`; the columns keep it.

### 3.3 Space, radius, elevation, motion

| Rule | Value |
|---|---|
| Spacing scale | `0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 / 3 / 4` rem (current values already sit on it) |
| Radius | cards `0.5rem` · fields `0.375rem` (both existing) · pills `999px` |
| Elevation | none at rest; `0 1px 2px rgba(30,58,47,.08), 0 4px 12px rgba(30,58,47,.06)` on hover/focus-within |
| Motion | `150ms ease-out` on hover/focus transitions only; `@media (prefers-reduced-motion: reduce)` sets transitions to none |

---

## 4. Component specs

### 4.1 Header band (slot 9)

Full-bleed `--tint-band` behind the banner, h1, and lede; the 60rem shell grid is
unchanged inside it. The season label becomes an official-green chip on the band's
right edge (dot + "2025/26 season"). The band ends at the comparison cards.

```
┌────────────────────────────────────────────────────────────┐
│ MILKCOMPASS                                  ● 2025/26 season│
│                                                            │
│ What does the milk price mean for your farm?               │
│ Compare today's reference prices and explore your revenue. │
└────────────────────────────────────────────────────────────┘
```

### 4.2 Comparison card + basis tag lockup (slots 1, 3)

Card anatomy, top to bottom: card title (unchanged) → **price lockup** → basis chip →
meta lines (unchanged content) → status chips → source link.

Price lockup: `$9.50 /kgMS` at existing size, followed by a short pill tag naming the
basis — the direct import of Vesper's "fat-credit method" tag:

- Official card: green tint chip `FORECAST`.
- Futures card: blue tint chip `MIDPOINT` / `LAST TRADE` / `PRIOR SETTLE` per the
  snapshot's selected basis — the selected basis is always visible, per the data
  contract.

**The tag is additive.** Every existing meta line survives beside it unchanged:
the full basis sentence (bid/offer prices, or the last-trade date, or "Prior
settlement"), the contract/expiry line, the volume/OI line, the quoted timestamp,
the check provenance, and the source link. The tag summarises; the meta lines carry
the provenance. Nothing shown today may be dropped.

```
┌─ Fonterra forecast ──────────────┐  ┌─ Futures reference ─────────────┐
│ $9.50 /kgMS  [FORECAST]          │  │ $9.70 /kgMS  [MIDPOINT]         │
│ Range $9.00–$10.00 /kgMS         │  │ Midpoint of bid $9.69 and …     │
│ Announced 28 Aug                 │  │ Contract MKP2026 · expires …    │
│ ● Up to date                     │  │ Bid 5 · Offer 10 · OI 1,234     │
│ View official source             │  │ Quoted 23 Sep, 11:30 (NZ time)  │
│                                  │  │ ● Up to date · View NZX quotes  │
└──────────────────────────────────┘  └─────────────────────────────────┘
```

### 4.3 Comparison strip (slot 4) — the hero addition

A pure-CSS figure under the two cards (inside the comparison section), plotting both
sources on one scale. No charting library: it is a rounded track, a wash fill, solid
boundary ticks, and two markers.

```
            Official $9.50
                 ▼
      |━━━━━━━━━━━━━━━━━━━━━━━━━━|
    $9.00                        $10.00
                        ▲
                        Futures $9.70
 ─────────────────────────────────────────────
 (●) Official forecast   (●) NZX futures        ← two-item key
```

**Domain — defined per state, never as one formula over possibly-null values:**

| State | Domain |
|---|---|
| range + futures | `[min(low, futures), max(high, futures)]` |
| range, no futures | `[low, high]` |
| no range + futures | `[min(midpoint, futures), max(midpoint, futures)]` (two-dot scale, no fill) |
| no range, no futures | no strip at all |

Every domain is padded 2% of span on each side as unlabeled breathing room, and
enforces a **minimum span of $0.50**: if the span above is smaller, the domain centres
on the midpoint of the extremes and extends ±$0.25. Equal values (including
`low = midpoint = high`) therefore never collapse the track. **Markers are never
clamped** — the padded domain guarantees interior placement, including futures outside
the published range.

**Ticks:** solid 2px boundary ticks in `--color-mark-official` (≥3:1) sit *at the
published low and high* when a range exists — the labels `$9.00`/`$10.00` are those
tick values. In the no-range state the ticks sit at the two plotted point values. The
padded domain ends themselves are never ticked or labeled. The low→high extent renders
as the green wash (35% over the track, composite `#9db498` — decorative; the boundary
ticks carry the extent for CVD/grayscale).

**Markers and labels:** 12px circles (≥8px rule) with a 2px surface ring. Official
marker `--color-mark-official`, label above the track; futures marker
`--color-mark-futures`, label below — *always* opposed vertically, so the two labels
can never collide even when the markers coincide. Labels carry name + value; when the
futures quote is old (>72 h) the futures label appends `· old quote`. Nothing else
about retention or timestamps appears on the strip — that provenance lives in the
cards (§4.6).

**Edge-aware alignment:** when a marker sits within 15% of a domain edge, its label
aligns toward the track interior (left-aligned at the marker when near the left edge,
right-aligned when near the right edge, centered otherwise). This is independent of
marker positioning and must be tested with the futures marker outside the range in
*both* directions at 375px.

**Key:** a two-item legend (swatch + name) is always present when both series render —
identity is never colour-matched alone. Official-only renders without a key (single
series; the title names it).

**Semantics:** `role="img"` with an aria-label carrying the sentence ("Futures $9.70
sits $0.20 above the official midpoint $9.50, inside the published range $9.00 to
$10.00"). The same numbers remain in the cards' text, so nothing is gated behind the
graphic.

### 4.4 Stat-tile row (slot 8)

The revenue results `<dl>` becomes a responsive tile row (2 columns ≥45rem, wrapping).
Tile contract: **label** (sentence case, no colon) · **value** (semibold, proportional
figures, full-dollar NZD — the assumptions sentence's nearest-dollar rounding is the
contract; no compact notation like `$1.42M`) · optional **sub-caption**.

**Tile presence is a function of state, not a fixed count:**

| Tile | Renders when |
|---|---|
| Official forecast revenue | production valid and calculation finite |
| Futures reference revenue | above **and** futures status ok |
| Futures vs official | same as futures tile (it is their difference) |
| $0.50/kgMS sensitivity | production valid and calculation finite |

So valid production with futures unavailable renders **two tiles** (official +
sensitivity) plus a guidance cell where the futures-dependent tiles would sit; blank,
invalid, or overflowing production renders no tiles, only the existing guidance
sentences.

```
┌ Official forecast revenue ┐ ┌ Futures reference revenue ┐
│ NZ$1,425,000              │ │ NZ$1,455,000               │
│ at $9.50 /kgMS            │ │ at $9.70 /kgMS             │
└───────────────────────────┘ └────────────────────────────┘
┌ Futures vs official ──────┐ ┌ $0.50/kgMS sensitivity ────┐
│ +NZ$30,000 above          │ │ NZ$75,000                   │
│ the official forecast     │ │ per $0.50 move              │
└───────────────────────────┘ └────────────────────────────┘
```

Delta tile: signed (`+NZ$30,000`), worded ("above the official forecast"), and coloured
(`--color-delta-up` / `--color-delta-down`) — all three channels, because colour alone
is not a channel. The existing `differenceLine` copy already supplies the words,
including the "rounds to NZ$0" sentence.

### 4.5 Production input: slider + text pair (slot 7)

Vesper's calculator pattern, in native controls only. The existing text input stays
the **single source of truth**; the slider is a convenience for coarse entry.

- Native `<input type="range">`, 20,000–500,000 kgMS, step 1,000, accessible label
  "Production slider". **These are interaction bounds, not validation bounds** —
  `parseProduction` accepts any non-negative plain number (including 0, values below
  20,000, above 500,000, and up to two decimals). A typed value outside the slider's
  span remains exactly as typed; only the thumb's *display* parks at the nearest stop.
  A visually-hidden note on the slider states that its position is approximate outside
  its range.
- State table:

| Text field state | Thumb | Writes production? |
|---|---|---|
| blank | parks at 150,000 (the example anchor), purely visual | no — only deliberate slider interaction writes |
| invalid | stays at the last valid position (or the anchor if none) | no |
| valid, inside bounds | moves to the value | typing already wrote |
| valid, outside bounds | parks at nearest stop, text unchanged | typing already wrote |

  (A React `onChange` on a range input fires only on user interaction, so the parked
  default can never write state — the tests must pin this.)
- Dragging writes the stepped value through to the text field.
- **Accessibility (closes an existing gap):** the production text input gains
  `aria-invalid` and `aria-describedby` pointing at its guidance sentence — matching
  what the scenario inputs already do — and the slider carries its own
  `aria-describedby` naming its units and its approximate relationship to the precise
  text value.

The example button remains for the first-run experience. Scenario price inputs stay
text-only: three sliders would imply a precision these editable numbers don't have,
and the range strip already shows where they sit.

### 4.6 Status chips (slot 6)

The warning lines become a chip row per card. Chips are **independent predicates**
evaluated per source at request time (reuse `freshness()`), but the reassuring chip
yields: `● Up to date` renders only when no other chip applies to that card. The dot
never carries meaning alone — the sentence is the content.

| Predicate | Chip text | Style |
|---|---|---|
| check ok / retained-ok **and** no other chip | `● Up to date` | `--tint-official` / `--tint-futures` by card, ink text |
| check outcome retained | `● Showing previous value — last collection <checkedAt> failed` | `--tint-warn` |
| check older than 36 h | `● Last check is more than 36 hours old` | `--tint-warn` |
| quote older than 72 h (futures only) | `● Quote is more than 72 hours old` | `--tint-warn` |
| no usable value | `○ Unavailable` | white, dashed border (existing dashed idiom) |

These coexist by design: a successful recent check can legitimately retrieve an old
quote (both `Up to date` suppressed and `Quote old` shown), and a retained value with
a stale check shows two amber chips. Provenance meta lines stay as plain text under
the chips — "Checked …" lines report the last successful retrieval timestamp
(`retrievedAt`, falling back to `checkedAt` when `checks` is absent), while the
retention chip carries the *failed* check's date. Value timestamps (`Announced`,
`Quoted`) are unaffected and always shown.

### 4.7 Footer (slot 9)

Structured, still one compact block: a two-line source credit with the mark swatches
(● Fonterra forecast · ● NZX futures, matching the strip key), then the existing
development-preview sentence. The mark vocabulary closes the loop: a reader who only
saw the footer could still decode the strip.

---

## 5. State matrix (display contract)

Combinations the snapshot model can produce, and what the extended UI shows. All
freshness predicates are evaluated at request time; `checks` and `futures` are both
optional in the parsed snapshot, and every fallback below is the one the current
components already use.

| Snapshot state | Cards | Strip | Tiles |
|---|---|---|---|
| both ok, fresh | price + basis tag + `● Up to date` | full, both markers + key | 4 tiles (valid production) |
| official ok, futures unavailable (any reason) | futures card: dashed `○ Unavailable` + reason sentence + check age (fallback `collectedAt`) | official range only, no key | 2 tiles + guidance cell |
| futures retained (check failed) | value + `● Showing previous value — <failed date> failed` | full; futures label unchanged unless quote also old | 4 tiles |
| official retained | value + retention chip + failed date | full (official marker unchanged — its `announcedAt` is its own provenance) | 4 tiles |
| both retained | both retention chips | full | 4 tiles |
| quote >72 h | `● Quote is more than 72 hours old` | full; futures label appends `· old quote` | 4 tiles |
| check >36 h (either source) | `● Last check is more than 36 hours old` on that card | as its state above | as above |
| `checks` absent | no chips; "Checked …" falls back to `retrievedAt` / `collectedAt` | as its state above | as above |
| `futures` block absent | futures card: dashed unavailable + check age (fallback `collectedAt`) | official range only, no key | 2 tiles + guidance cell |
| no published range (`rangeSource: "none"`) | official card: "No published range" line unchanged | two-dot scale (midpoint + futures), ticks at both values | 4 tiles |
| equal prices / degenerate range | unchanged | minimum-span domain (§4.3) | unchanged |
| no snapshot at all | dashed unavailable panel, no cards | none | guidance only |
| production blank / invalid / overflow | cards unaffected | unaffected | guidance sentences instead of tiles |

**Zeros rule:** no zero is ever *fabricated* from missing or invalid data. Genuine
zeros render as themselves — valid production of 0 kgMS produces `NZ$0`, and the
existing "rounds to NZ$0" difference sentence stands. This restates the plan's hard
constraint precisely: missing prices never become zero prices or zero revenue.

---

## 6. Constraint compliance

- **No new dependencies.** Everything above is CSS custom properties, CSS Modules
  classes, and native elements (`input[type=range]`, `dl`, `figure`). No charting
  library; the strip is HTML/CSS geometry.
- **Accessible native controls** (plan): slider is a native range input with a real
  label and description; chips are `<p>`/`<span>` text, not interactive; focus
  outlines unchanged at `--color-focus` 7.61:1. The production input's missing
  `aria-invalid`/`aria-describedby` (present on scenario inputs) is closed by §4.5.
- **Contrast**: every text/background pair in §3.1 is ≥4.5:1 (computed). Non-text
  marks ≥3:1: markers, key swatches, boundary ticks, focus outlines. The range wash
  is decorative and documented as such (composite `#9db498`); the boundary ticks
  carry the range extent where the wash cannot. Identity is never colour-alone
  (key + direct labels + signed words).
- **Reduced motion**: transitions disabled under `prefers-reduced-motion`.
- **Tone**: no "live" claims anywhere — chips say what was checked and when, matching
  the data-quality contract. English only, NZ spelling.

## 7. Deliberately not adopted

Dark navy theme · mega-nav/footer sitemap · logo walls · trial/demo CTAs · cookie
wall · AI upsell bands · charts and sparklines (release 1) · price-scenario sliders ·
FAQ accordion (deferred, good candidate later). Each either belongs to Vesper's
funnel/brand, or is excluded by the implementation plan's scope and dependency rules.

## 8. If this proceeds to implementation

Tracked as Tasks 9–12 in `tasks/design-extension/todo.md` (see `tasks/design-extension/plan.md` for the chain):

1. **Task 9 — tokens + card refinements:** custom properties, header band, basis
   tags, status chips, footer. Markup changes in `comparison-view.tsx`, not CSS-only.
2. **Task 10 — comparison strip:** domain helper + presentational component + tests
   for every state in §4.3/§5.
3. **Task 11 — stat tiles:** revenue-panel rework per §4.4.
4. **Task 12 — production slider:** interaction per §4.5 truth table; runs the full
   integrated release gate, so it depends on Tasks 10 *and* 11.

The public-deployment block (NZX/SGX display rights) is unaffected: this is styling
of the fixture-fed preview.
