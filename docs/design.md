# MilkCompass UI Design Extension

Status: **design proposal — not implemented.** Derived from a design-language study of
Vesper Tool's [SMP calculator](https://vespertool.com/calculators/dairy/smp/) and
[homepage](https://vespertool.com/), extended through a seeded decision procedure
(random seed below). Any implementation goes through `tasks/todo.md` as its own task;
this document is the visual/interaction contract for that work.

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
| 1 | Accent strategy | 6 | Complementary pair: green marks = official, blue marks = futures. Text stays ink. |
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

Added to `:root` in `app/globals.css` as CSS custom properties (CSS Modules keep
consuming them; no preprocessor, no dependency).

### 3.1 Colour

Existing tokens are formalised, not changed. New tokens are **mark colours**
(decorative identity: markers, chips, deltas) and **tints** (chip/band backgrounds).

| Token | Value | Role | Verified contrast |
|---|---|---|---|
| `--color-ink` | `#1e3a2f` | body text | 11.64:1 on paper ✓ |
| `--color-ink-soft` | `#4c6357` | meta text | 6.50:1 on white ✓ |
| `--color-paper` | `#faf8f4` | page background | — |
| `--color-card` | `#ffffff` | card surface | — |
| `--color-line` | `#d8d2c4` | hairlines, card borders | 1.54:1 (border, non-text ok) |
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

### 3.2 Type

System stack unchanged (no webfont — a brand face would be a new dependency and a
perf cost the plan doesn't authorise). Formalised scale:

| Token / rule | Value |
|---|---|
| `--text-hero` | `clamp(1.5rem, 5vw, 2.25rem)` (h1, existing) |
| `--text-price` | `2.25rem / 700` (card prices, existing) |
| `--text-stat` | `1.375rem / 600` (stat tile values — **proportional figures**, no `tabular-nums`) |
| `--text-body` | `0.9375rem–1.0625rem` (existing) |
| `--text-chip` | `0.75rem / 600, letter-spacing 0.04em` |

Figure rule: `tabular-nums` only where numbers stack in columns (scenario rows,
result ledgers). Large standalone values use the font's proportional figures —
`121` in tabular digits reads loose at display sizes. This *refines* today's blanket
`tabular-nums`; the columns keep it.

### 3.3 Space, radius, elevation, motion

| Token | Value |
|---|---|
| `--space-*` | `0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 / 3 / 4` rem ramp (current values already sit on it) |
| `--radius-card` | `0.5rem` (existing) · `--radius-field` `0.375rem` (existing) · `--radius-pill` `999px` |
| `--shadow-rest` | none |
| `--shadow-raise` | `0 1px 2px rgba(30,58,47,.08), 0 4px 12px rgba(30,58,47,.06)` |
| `--motion-fast` | `150ms ease-out` — hover/focus transitions only; `@media (prefers-reduced-motion: reduce)` sets transitions to none |

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
meta lines → status chips → source link.

Price lockup: `$9.50 /kgMS` at existing size, followed by a pill tag naming the
basis — the direct import of Vesper's "fat-credit method" tag:

- Official card: green tint chip `FORECAST` (it is a forecast midpoint, and the chip
  is where "announced …" provenance now starts).
- Futures card: blue tint chip `MIDPOINT OF BID & OFFER` / `LAST TRADE` /
  `PRIOR SETTLEMENT` — the selected basis is always visible, per the data contract.

```
┌─ Fonterra forecast ──────────────┐  ┌─ Futures reference ─────────────┐
│ $9.50 /kgMS  (FORECAST)          │  │ $9.70 /kgMS  (MIDPOINT)         │
│ Range $9.00–$10.00 /kgMS         │  │ Contract MKP2026 · expires …    │
│ Announced 28 Aug                 │  │ Bid 5 · Offer 10 · OI 1,234     │
│ ● Up to date                     │  │ ● Up to date                     │
│ View official source             │  │ View NZX quotes                 │
└──────────────────────────────────┘  └─────────────────────────────────┘
```

Volume/OI meta line becomes a compact definition row with tabular figures; it is a
column of numbers now, so `tabular-nums` stays there.

### 4.3 Comparison strip (slot 4) — the hero addition

A pure-CSS figure under the two cards (inside the comparison section), plotting both
sources on one scale. No charting library: it is a rounded track, a filled official
range, and two markers.

```
            Official $9.50
                 ▼
 $9.00 ████████████████████████████ $10.00
                        ▲
                        Futures $9.70
 ─────────────────────────────────────────────
 (●) Official forecast   (●) NZX futures        ← two-item key
```

Geometry and rules:

- Domain: `[min(low, futures), max(high, futures)]`, padded 2% each side. **Markers
  are never clamped** — a marker pinned to the track edge lies about its value. The
  padded domain guarantees interior placement, including futures outside the range.
- Track: 8px tall, `--radius-pill`, fill `--color-line`; the official low→high range
  renders as a `--color-mark-official` fill at ~35% tint over it, 2px inset (surface
  gap). Hairline 1px solid ticks at the domain ends, labelled `$9.00` / `$10.00`.
- Markers: 12px circles (≥8px rule), 2px surface ring. Official marker
  `--color-mark-official` above-centre label; futures marker `--color-mark-futures`
  below-centre label — *always* above/below respectively, so the two labels can never
  collide, even when the markers coincide.
- Key: a two-item legend (swatch + name) is always present — two series, so identity
  is never colour-matched alone. Labels are selective: exactly the two marks, each
  carrying name + value.
- Semantics: `role="img"` with an aria-label carrying the sentence ("Futures $9.70
  sits $0.20 above the official midpoint $9.50, inside the published range $9.00 to
  $10.00"). The same numbers remain in the cards' text, so nothing is gated behind
  the graphic.
- Degenerate states: no published range (`rangeSource: "none"`) → strip becomes a
  two-dot scale with no range fill; futures unavailable → official range only, key
  omitted (single series); neither → no strip at all.

### 4.4 Stat-tile row (slot 8)

The revenue results `<dl>` becomes a responsive tile row (2 columns ≥45rem, wrapping).
Tile contract: **label** (sentence case, no colon) · **value** (semibold, proportional
figures, auto-compact `$1.42M`) · optional **sub-caption**.

```
┌ Official forecast revenue ┐ ┌ Futures reference revenue ┐
│ $1,425,000                │ │ $1,455,000                 │
│ at $9.50 /kgMS            │ │ at $9.70 /kgMS             │
└───────────────────────────┘ └────────────────────────────┘
┌ Futures vs official ──────┐ ┌ $0.50/kgMS sensitivity ────┐
│ +$30,000 above            │ │ $7,500                     │
│ the official forecast     │ │ per $0.50 move             │
└───────────────────────────┘ └────────────────────────────┘
```

Delta tile: signed (`+$30,000`), worded ("above the official forecast"), and coloured
(`--color-delta-up` / `--color-delta-down`) — all three channels, because colour alone
is not a channel. The existing `differenceLine` copy already supplies the words.

Blank/invalid/overflow states keep today's guidance sentences in place of the tiles;
a missing tile is an empty cell with its guidance text, never a zero.

### 4.5 Production input: slider + text pair (slot 7)

Vesper's calculator pattern, in native controls only:

- The existing text input stays the **source of truth** (it accepts the full precise
  grammar already validated by `parseProduction`).
- Below it, a native `<input type="range">` (20,000–500,000 kgMS, step 1,000,
  accessible label "Production slider") snaps to the nearest valid step on drag and
  writes through to the text field; typing updates the thumb. Out-of-range typed
  values don't move the thumb past its stop — the text and its guidance own the error.
- The example button remains for the first-run experience.

Scenario price inputs stay text-only: three sliders would imply a precision these
editable numbers don't have, and the range strip already shows where they sit.

### 4.6 Status chips (slot 6)

Replace the bare warning lines with a chip row per card (the sentences stay as chip
text; nothing is communicated by the dot alone):

| State | Chip | Style |
|---|---|---|
| check ok & fresh | `● Up to date` | `--tint-official` / `--tint-futures` by card, text token ink |
| check retained | `● Showing previous value` | `--tint-warn`, dot `--color-warn-text` |
| check stale (>36 h) | `● Last check is more than 36 hours old` | `--tint-warn` |
| quote old (>72 h) | `● Quote is more than 72 hours old` | `--tint-warn` |
| unavailable | `○ Unavailable` | white, dashed border (inherits the existing dashed idiom) |

"Checked …" provenance lines stay as plain meta text under the chips — timestamps are
content, not status.

### 4.7 Footer (slot 9)

Structured, still one compact block: a two-line source credit with the mark swatches
(● Fonterra forecast · ● NZX futures, matching the strip key), then the existing
development-preview sentence. The mark vocabulary closes the loop: a reader who only
saw the footer could still decode the strip.

---

## 5. State matrix (display contract)

Every combination the snapshot model can produce, and what the extended UI shows:

| Snapshot state | Cards | Strip | Tiles |
|---|---|---|---|
| both ok, fresh | price + basis chip + `● Up to date` | full, two markers + key | four tiles |
| official ok, futures unavailable (reason) | futures card: dashed `○ Unavailable` + reason sentence + check age | official range only, no key | three tiles + guidance cell |
| futures retained (check failed) | value + `● Showing previous value` | full (futures marker keeps its original timestamp label) | four tiles |
| quote >72 h | `● Quote is more than 72 hours old` | full; futures label gains "(old quote)" | four tiles |
| check >36 h | `● Last check is more than 36 hours old` | as above | as above |
| no snapshot at all | dashed unavailable panel, no cards | none | guidance only |
| blank/invalid production | cards unaffected | unaffected | guidance sentences, no zeros |

Missing prices never become zero prices or zero revenue — blank cells stay blank with
guidance; this restates the plan's hard constraint as a UI rule.

---

## 6. Constraint compliance

- **No new dependencies.** Everything above is CSS custom properties, CSS Modules
  classes, and native elements (`input[type=range]`, `dl`, `figure`). No charting
  library; the strip is HTML/CSS geometry.
- **Accessible native controls** (plan): slider is a native range input with a real
  label; chips are `<p>`/`<span>` text, not interactive; focus outlines unchanged at
  `--color-focus` 7.61:1.
- **Contrast**: every text/background pair above is ≥4.5:1 (computed, listed in §3.1);
  every mark ≥3:1. Identity is never colour-alone (key + direct labels + signed words).
- **Reduced motion**: transitions disabled under `prefers-reduced-motion`.
- **Tone**: no "live" claims anywhere — chips say what was checked and when, matching
  the data-quality contract. English only, NZ spelling.

## 7. Deliberately not adopted

Dark navy theme · mega-nav/footer sitemap · logo walls · trial/demo CTAs · cookie
wall · AI upsell bands · charts and sparklines (release 1) · price-scenario sliders ·
FAQ accordion (deferred, good candidate later). Each either belongs to Vesper's
funnel/brand, or is excluded by the implementation plan's scope and dependency rules.

## 8. If this proceeds to implementation

Suggested slices (each its own `tasks/todo.md` entry with tests):

1. **Tokens + chips + stat tiles** — CSS/module changes only; existing tests keep
   passing; add tile rendering tests for the state matrix rows.
2. **Comparison strip** — new presentational component + unit tests for domain
   computation (clamping ban, degenerate states) + the aria-label sentence.
3. **Production slider** — client interaction + tests for the write-through and
   out-of-range behaviour; e2e journey gains a drag step.

The public-deployment block (NZX/SGX display rights) is unaffected: this is styling
of the fixture-fed preview.
