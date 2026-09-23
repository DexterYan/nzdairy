# MilkCompass next release: market changes and farm impact

Status: proposed implementation plan. Written 2026-09-24 against `main`
(`4084804`). This document plans work; it does not authorise purchases, provider
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
update the relevant design and engineering contracts before changing those areas.
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

- Define an additive, versioned observation/history contract with series ID,
  season/contract or reporting period, value/unit/currency, quote basis, source
  observation/publication/retrieval times, provider and parser version, and revision
  identity. Record bid/offer, volumes and open interest when supplied.
- Archive raw responses where permitted, with content hashes and parser versions,
  before publishing validated data. Apply provider-specific retention rules; never
  archive credentials. Existing archives contain parsed results, not raw evidence.
- Deduplicate repeated source observations. A successful refetch or retained value
  is not a new market observation. Preserve revisions without silently rewriting
  previously published evidence.
- Materialise a bounded current-season history object; the page must not list or
  scan the archive. Publish immutable history versions before updating a manifest
  that references the matching latest snapshot and history. Preserve the existing
  reader path until migration is tested; a partial write cannot publish mixed versions.
- Keep current-season contract matching and all existing missing-value, freshness
  and retention rules. History failure must leave the current comparison usable.
- Start with daily collection. Context freshness follows each source's publication
  cadence; monthly collections must not inherit the futures 72-hour threshold.

### Comparable changes

For “since last week,” use the latest valid observation at or before seven calendar
days before the current observation, with at most seven further calendar days of
lookback. Show both actual dates; outside that window show insufficient history.
This is a display policy, not a trading-calendar assertion.

For “since Fonterra's announcement,” compare the current MKP reference with the last
eligible observation at or before that announcement. If only a publication date is
known, use the prior Auckland calendar day's cutoff to avoid using post-announcement
data. Apply the same seven-day lookback tolerance and expose the baseline date.

Only calculate deltas for matching series, contract, currency, unit and quote basis.
A midpoint-to-last-trade or settlement transition displays “basis changed”; it must
not produce an apparent market movement. Keep Fonterra forecast revisions separate
from futures movements. Split chart segments at basis transitions and missing or
stale intervals. Repeated carried-forward prices cannot imply fresh trading.

The official forecast is a step series of announcements; the published low/high
range is not a probability band. Current warnings stay visible alongside history.
Backfill only verifiable observations from permitted sources; never manufacture
daily history from today's forecast or duplicate archives.

### Farmer-facing presentation

Preserve the current comparison and calculator. Add, in order:

1. A dated change summary and farm-revenue sensitivity using the existing production
   input. Blank/invalid production shows guidance; genuine zero remains zero.
2. A compact current-season history chart with a text/table equivalent, distinguishable
   forecast and futures series, and visible gaps. Prefer native SVG and existing CSS.
3. Plain-language quote evidence: age, basis, spread and available activity. Avoid an
   invented confidence score; missing volume is unknown, not zero or “illiquid.”
4. Independently dated context cards and a deterministic, source-linked summary of
   observed changes. No claim that a particular driver caused the farmgate movement.

Context stays in native units. WMP/SMP USD/tonne, NZD/USD and collection volumes are
not converted directly into NZD/kgMS forecasts. Revenue sensitivity excludes GST,
costs, dividends, premiums, deductions and payment timing, as in the existing product.

## Delivery sequence

Executable criteria are appended as Tasks 13–22 in [`tasks/todo.md`](../tasks/todo.md).

```text
13 Source/access decision
  -> 14 Observation/history contract
      -> 15 Auditable publication
          -> 16 Historical changes
              -> 17 Farm-impact history UI
                  -> 18 Quote-quality presentation
                      -> Core checkpoint
                          -> 19 FX context
                              -> 20 Milk-collection context
                                  -> 21 GDT context (conditional)
                                      -> 22 Integrated release verification
```

Fixture work may proceed after the source requirements are documented, while
commercial access remains unresolved. Production ingestion and public display wait
for the relevant rights evidence. Task 22 may omit explicitly deferred context
sources, but cannot waive core data rights or validation.

## Verification and release gates

- Per slice: focused logic/component tests for its acceptance criteria, then
  `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Checkpoints after Tasks 15, 18 and 21: verify publication recovery, the core farmer
  journey, and independent context degradation respectively.
- Final gate: add `npm run build:worker` and `npm run test:e2e`; inspect 375px and
  desktop, keyboard access, text alternatives, reduced motion and long labels.
- Exercise missing history, basis transitions, publication-date ambiguity, revision
  handling, repeated observations, partial writes, season rollover and unavailable
  context. Test real-provider integration separately from deterministic fixtures.
- Observe at least seven consecutive scheduled production-eligible collection runs
  in a restricted environment. Confirm freshness, parser failure visibility and
  restoration of the previous manifest. A quiet market need not produce seven prices.
- Public launch requires documented entitlements for every exposed dataset and the
  existing deployment gate. Restrict or omit unlicensed context. Roll back the
  publication manifest or application independently without deleting evidence.

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
