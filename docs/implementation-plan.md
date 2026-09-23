# Implementation Plan: MilkCompass First Release

## Overview

Build one English-language page for Fonterra suppliers to compare the current season's official forecast with a timestamped futures reference, enter expected production, and explore annual milk revenue under three editable price scenarios.

## Product Decisions

- Use **MilkCompass** as the working name.
- Present the page in this order: season and price comparison, expected production, revenue sensitivity, three scenarios, assumptions, and sources.
- Cover the current June-May season, determined in `Pacific/Auckland`. Match its exact MKP contract and never substitute another season.
- Show Fonterra's midpoint, published range, announcement date, source link, and last successful check.
- Show the futures reference, contract, price basis, source timestamp, collection timestamp, bid/offer spread, available volume, and open interest.
- Describe the futures value as a delayed reference, not a guaranteed forecast or executable price.
- Start production blank and label it "Expected full-season production, kgMS". Provide an explicit 150,000 kgMS example action.
- Initialise the three scenarios from Fonterra's published low, midpoint, and high values. Leave missing endpoints blank rather than inventing a range.
- Calculate `revenue = production x price`, differences from the official midpoint, the futures-versus-official difference, and sensitivity to a +/-$0.50/kgMS change.
- Describe every calculated result as gross full-season milk revenue in NZD. Exclude GST, costs, dividends, premiums, deductions, and payment timing.
- Store user inputs locally per season and provide a reset action. New source data must not silently overwrite edited scenarios.

## Architecture Decisions

- Use Next.js App Router, TypeScript, npm, and OpenNext on Cloudflare Workers.
- Use CSS Modules and accessible native controls. Keep the page mobile-first and avoid a charting library for the first release.
- Use a separate scheduled Cloudflare Worker to collect data daily at `06:00 UTC` and store private snapshots in R2.
- Read the latest snapshot through a server-side binding. Run revenue calculations in the browser.
- Adapt the existing Fonterra and NZX parsers from the `cot-analysis/tools/dairy` proof of concept, retaining attribution and removing unrelated WMP/GDT reporting.
- Do not add accounts, a database, probability bands, advice, alerts, or historical charts.

## Data Contract and Quality Rules

Create a versioned snapshot containing the season, official forecast, futures reference, source URLs, publication or quote timestamps, retrieval timestamps, and per-source status.

- Parse Fonterra's explicitly labelled season and associated footnotes; validate `low <= midpoint <= high` when all values exist.
- Prefer a valid two-sided bid/offer midpoint. Otherwise use a positive last trade with a known trade date, then a positive prior settlement. Always display the selected basis.
- Reject crossed quotes, wrong currencies, expired contracts, and wrong-season contracts.
- Keep source, quote, trade, and retrieval timestamps distinct. A row-update timestamp is not automatically a trade timestamp.
- Warn when a quote timestamp is unverifiable or in the future. Do not use it to claim freshness.
- Label references older than 72 hours as old and collection checks older than 36 hours as stale. These are display rules, not trading-calendar judgements.
- Archive successful source results before publishing the combined latest snapshot.
- On partial failure, retain the previous valid value with its original timestamp and expose the failed check.
- Use bounded fetch timeouts and one retry for transient network or server failures.

## Implementation Order

1. Establish the Next.js, TypeScript, test, and lint toolchain.
2. Configure OpenNext, the web Worker, the collection Worker, and local R2 bindings.
3. Connect and validate the current-season Fonterra forecast.
4. Connect and validate the matching MKP futures reference and its quality indicators.
5. Add production input, revenue comparison, and +/-$0.50 sensitivity.
6. Add editable scenarios, local persistence, and reset behaviour.
7. Add scheduled snapshot publication and last-known-good failure handling.
8. Complete responsive, accessibility, degraded-data, and production-build verification.

The detailed task checklist is maintained in [`tasks/first-release/todo.md`](../tasks/first-release/todo.md).

## Acceptance Examples

- At 150,000 kgMS, a $0.50/kgMS change produces NZ$75,000 of revenue sensitivity.
- At $9.25/kgMS, revenue is NZ$1,387,500.
- At $9.80/kgMS, revenue is NZ$1,470,000, or NZ$82,500 above the $9.25 result.
- Missing prices never become zero prices or zero revenue differences.
- Blank, negative, non-finite, and excessive-precision inputs do not produce results; zero production produces zero revenue.
- June 1 rollover, New Zealand daylight-saving display, old quotes, invalid timestamps, partial source failure, and absent snapshots have deterministic states.
- The complete page works at 375px and desktop widths with keyboard access, associated labels, visible focus, and text-based warnings.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| NZX or SGX redistribution rights are unclear | High | Keep public launch blocked until display rights are documented; use fixtures or restricted previews meanwhile. |
| Source markup changes | High | Isolate parsers, retain fixtures, fail visibly, and preserve the last-known-good snapshot. |
| A stale quote appears current | High | Display timestamp provenance, basis, age, and warning state beside the value. |
| Revenue is mistaken for profit | Medium | Label every output as gross milk revenue and keep assumptions adjacent to results. |
| OpenNext or Next.js incompatibility | Medium | Pin compatible versions and verify the Workers bundle early. |

## Release Boundary

The first release excludes profit forecasts, cash-flow schedules, probability bands, additional seasons, feeding or herd recommendations, hedging, accounts, alerts, and historical charts. Public deployment is blocked until market-data display rights are confirmed.
