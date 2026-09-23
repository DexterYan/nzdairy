# MilkCompass next-release presentation

Status: **design contract for Tasks 17a, 17b and 18** (and the shape of the
deferred context cards 19–21). It inherits `docs/design.md` (seed 668827389
pass) unchanged — tokens, mark colours, chips, stat tiles, focus and motion
rules all carry over; nothing here reopens them. Behaviour comes from
[the next-release plan](next-release-plan.md); where this file and the plan
conflict, the plan wins. Effective-time meanings follow the Task 13a
requirements matrix in [Data rights](data-rights.md).

Nothing here adds a dependency: native SVG, existing CSS Modules, existing
tokens. English only, NZ spelling, no "live" claims anywhere.

---

## 1. Page order after this release

Mobile-first single column inside the unchanged 60rem shell:

1. Header band — unchanged.
2. Comparison cards + strip — unchanged except the Task 18 refinements (§5).
3. **What changed** — new server-rendered section: dated change summaries.
4. Your gross milk revenue — same owner (`RevenuePanel`), gains movement
   sensitivity tiles (§3).
5. **Season history** — new section: SVG figure + table equivalent (§4).
6. Footer — provenance label becomes data-driven (§6).

Context cards (§7) mount after Season history when a source is enabled.

## 2. "What changed" section (Task 17a, server side)

A `<section aria-label="What changed">` between the strip and the revenue
panel. One entry per comparable period — "Since last week" and "Since
Fonterra's announcement" — each an ordinary text block (no card chrome;
this is reading material, not a calculator input).

**Comparable entry** (futures example):

> **Since last week** — futures reference $9.70 on 24 Sep, **up $0.20** from
> $9.50 on 17 Sep.

- The delta lockup reuses the delta-tile channels: signed (`+$0.20/kgMS`),
  worded ("up"/"down"), coloured (`--color-delta-up`/`-down`). Never colour
  alone.
- Both dates are always shown — actual endpoint and baseline dates from
  `lib/changes.ts`, never "today" or retrieval dates.
- The official entry appears only when a priced revision exists, and stays
  neutral: "Fonterra forecast $9.50 on 28 Aug, revised from $9.25 on 12 Jun."
  No-change notices never produce an entry.

**Suppressed entry** — a muted sentence in `--color-ink-soft`, never a delta:

| Reason | Copy |
|---|---|
| Insufficient history | "Not enough collected history yet to compare with last week — observations begin {date}." |
| Basis changed | "The futures reference changed basis on {date} ({from} → {to}), so values either side are not directly comparable." |
| Source changed | "The futures reference changed source on {date}; earlier values are not directly comparable." |
| Endpoint not fresh | "The current reference cannot be treated as fresh ({old quote / retained value / stale check}), so no {period} comparison is shown." |
| Season start | "A new season began on 1 June — changes compare within the {season} season only." |

Suppression reasons compose (basis change *and* old endpoint): show the most
specific one; the plan's comparability rules own the precedence.

## 3. Movement sensitivity in `RevenuePanel` (Task 17a, client side)

`ComparisonView` passes validated change data into `RevenuePanel` as a plain
prop. **Raw production state stays solely in `RevenuePanel`** — the
sensitivity is a read-only derivation, never a second state owner, and it
never writes scenario or production state.

Below the existing tile row, separated by a small subheading
("What a move means for you"), one tile per comparable delta:

| Tile | Value | Caption |
|---|---|---|
| Impact of the weekly move | `+NZ$30,000` | "+$0.20/kgMS since 17 Sep at your production" |
| Impact of the announcement move | `−NZ$22,500` | "−$0.15/kgMS since 12 Jun at your production" |

Tile contract unchanged from `docs/design.md` §4.4 (label · value ·
sub-caption; signed + worded + coloured; nearest-dollar rounding; the
sub-half-dollar case reuses the "rounds to NZ$0" caption).

**Presence is a function of state:**

| State | Sensitivity tiles |
|---|---|
| production valid, delta comparable | both/one tile per available delta |
| production blank or invalid | existing guidance sentence; no tiles |
| production overflow | existing "too large to calculate" guidance |
| production genuinely 0 | tiles render `NZ$0` (missing ≠ zero; genuine zero is zero) |
| delta suppressed | no tiles and no extra guidance — §2 already said why |

## 4. Season history (Task 17b)

A `<section aria-label="Season history">` after the revenue panel.

**Figure** — native inline SVG (no library), `viewBox`-scaled to 100% width,
~14rem tall at 375px, `role="img"` with an aria-label summary sentence
("Futures observations from 20 Sep to 24 Sep between $9.40 and $9.80;
forecast $9.50 since 28 Aug, range $9.00–$10.00."). Per-point tab stops are
deliberately absent — the table below is the keyboard/AT path.

- **Official series** — green step path: constant between dated priced
  announcements, stepping at each announcement date. The published range
  renders as the same decorative wash exemption as the strip (35%
  `--color-mark-official`); the boundary ticks carry the extent. A caption
  under the figure reads: "The shaded band is the published forecast range,
  not a probability range."
- **Futures series** — blue 12px point markers at verified observation
  times, joined by polyline segments. Lines break at basis changes, provider
  changes, failed-check intervals, and effective-time gaps over 72 hours.
  Carried-forward values are never drawn as fresh points.
- **Axes** — y in NZD/kgMS with at most five hairline gridlines at round
  values; x spans season start to the latest observation. Month labels at
  375px show at most every second month; value labels appear only on the
  first and latest points of each series.
- **Gaps and revisions** — the latest known revision is plotted; earlier
  revisions and gap intervals surface in the table's Note column. Never
  interpolate.

**Table equivalent** — `<details><summary>Show these observations as a
table</summary>` containing columns Date · Series · Value · Basis · Note
(newest first), Note carrying "revised from $9.25", "no verified observation
22–23 Sep", "basis changed to last trade". The summary line itself states the
observation count.

**Empty state** — "History for the {season} season is still building —
observations begin {date}." plus a pointer to the current values above. No
figure, no fabricated points, no prior-season carry-over.

## 5. Quote evidence refinements (Task 18)

Inside the futures card, meta lines keep their order; additions in place:

- **Spread line** (two-sided only, after the basis line): "Bid–offer spread
  $0.01" — numeric, no liquidity judgement ("tight"/"thin" are opinions;
  volume is unknown, never "illiquid").
- **Delayed-reference sentence** under the chips: "Delayed market reference —
  not an executable price." Always present on an ok futures card.
- **Activity line** — the existing sizes line is reworded as plain activity:
  "Market activity: 10 traded · bid size 5 · offer size 10 · open interest
  1,234". Unknown values read "not available" (replacing "n/a") — unknown is
  unknown, not zero.
- Old-quote, retained-value, and stale-check chips are unchanged (72/36-hour
  request-time rules). No confidence score exists anywhere.

The official card is untouched by Task 18.

## 6. Provenance labels (consumed by Task 15c)

The hardcoded footer sentence ("data is a frozen fixture, not live prices")
is replaced by a data-driven label from the release loader's provenance
field:

| Loader provenance | Footer sentence |
|---|---|
| `fixture` | "Development preview — showing a fixture snapshot, not live prices." |
| `collected` | "Collected from Fonterra and NZX on {date} — delayed reference data, not live prices." |
| `unknown` (legacy v1 mirror) | "Reference data collected from official sources; collection date unknown — not live prices." |

No variant says "live". Cards and chips are unchanged by provenance.

## 7. Context cards (Tasks 19–21 — deferred in this build)

**Deferred state: the section is entirely absent.** No empty scaffolding, no
"coming soon", no placeholder cards. Deferral is recorded in the task list
and `docs/data-rights.md`, not on the page.

When a source is enabled: `<section aria-label="Market context">` after
Season history, one `<article>` per card — title (source name), value in its
**native unit**, period sentence, a dated like-for-like change sentence (same
delta lockup as §2), source link, chip row. WMP/SMP stay USD/tonne, NZD/USD
stays a rate, collections stay kgMS — nothing converts toward NZD/kgMS.

**Source-specific freshness** (context cards do not use the 72-hour futures
rule): chips derive from overdue publication (`now > nextExpectedAt + grace`)
plus independent failed/stale checks:

| State | Chip |
|---|---|
| published on schedule | "Published {date} · next expected {date}" |
| overdue | "Expected {date}, not yet published" |
| failed check | existing retention chip idiom |
| no reliable schedule | "Publication schedule unknown — showing the latest observed {date}." Never "Up to date". |

A multi-card summary line, when more than one card is enabled, is
deterministic and factual ("Observed: NZD/USD up 0.5c since 17 Sep; WMP
US$3,850/t on 15 Sep."), source-linked, and never claims a farmgate effect.

## 8. State matrix (display contract)

| State | What changed | History | Sensitivity tiles | Context |
|---|---|---|---|---|
| fresh comparable history | dated deltas | full figure + table | tiles per delta | n/a |
| history unavailable (any reason) | suppression sentence | empty state | none | n/a |
| current check failed/retained or stale | endpoint-not-fresh sentence | figure; latest point unchanged | none | n/a |
| endpoint effective time > 72 h | endpoint-not-fresh sentence | figure; gaps drawn | none | n/a |
| basis transition (A→B or A→B→A) | basis-changed sentence | line break at transition | none for that period | n/a |
| provider transition | source-changed sentence | line break at transition | none for that period | n/a |
| date-only endpoints | deltas with whole-day dates | points at day resolution | tiles (dates shown) | n/a |
| no published range | unaffected | no wash band; step line only | unaffected | n/a |
| production blank/invalid/overflow | unaffected | unaffected | guidance instead | n/a |
| production 0 | unaffected | unaffected | `NZ$0` tiles | n/a |
| no snapshot at all | absent (unavailable panel) | absent | absent | absent |
| June 1 rollover | season-start sentence | new-season empty state | none until data | n/a |
| context deferred | n/a | n/a | n/a | section absent |
| context overdue / schedule unknown | n/a | n/a | n/a | per-card chip (§7) |

**Zeros rule unchanged:** no zero is fabricated from missing data; genuine
zeros render as themselves.

## 9. Verification hooks (for 17a/17b/18 acceptance)

- 375px and desktop: single column, long suppression sentences wrap (never
  truncate), figure stays legible with sparse labels, table reachable by
  keyboard.
- Text alternatives: figure aria-label + table carry every plotted number;
  suppression sentences carry every suppressed delta's reason.
- Reduced motion: static rendering; no new transitions.
- Component tests pin the presence functions above tile-by-tile and the
  suppression copy per reason; SSR tests pin provenance variants (§6).
