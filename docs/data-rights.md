# Data rights — NZX/SGX market data

**Status: no licence is in place. Public display remains blocked.** The e2e
gate (`scripts/e2e.mjs`) fails if `workers_dev` or `preview_urls` is enabled
in either wrangler config before this page documents a signed agreement or
written permission from SGX and NZX.

## What we display

One SGX-NZX Milk Price (MKP) futures contract per season — bid/offer midpoint,
or a positive last trade, or prior settlement, with volumes, open interest, and
distinct timestamps. The collector scrapes NZX's public quotes page once daily
at 06:00 UTC; the page itself is delayed 20 minutes (per NZX terms), and the
displayed value ages past 72 hours before it is labelled old. Sources are
attributed on the page via "View official source" / "View NZX quotes" links.

## Next-release source requirements (Task 13a)

Field-level requirements for the market-changes release, written against the
parsers as they exist today (`lib/nzx.ts`, `lib/fonterra.ts`, `lib/snapshot.ts`).
Provider selection (Task 13c) can stay pending: Tasks 14–18 build against
fixtures that satisfy this matrix.

**Current collection is not fixture-only, and it is not production access.**
The collector already fetches the live Fonterra and NZX pages on every run and
writes private snapshots to local R2; `fixtures/latest-snapshot.json` only
seeds the web tier's local preview. That collection is permitted local use.
What stays blocked is public display (above) and — for the next release —
production use of a replacement or supplementary feed, which requires the
entitlement evidence Task 13c records. Operational readiness of the scheduled
runs in a provisioned environment is unverified separately from the presence
of collector code.

| Requirement | Today (public NZX page) | Production feed must confirm | Historical price time |
|---|---|---|---|
| Exact current-season contract (`MKPUyy`, September expiry of the closing year) | `contractCode` with validated `expiryDate` | Contract coverage across seasons in use; no substitutes | Contract is part of observation identity |
| Currency and unit (`NZD`, `NZD/kgMS`) | Enforced by the parser | Same | Identity fields |
| Two-sided bid/offer with sizes | `bidPrice`/`offerPrice`, `bidVolume`/`offerVolume`; crossed markets rejected | Availability and semantics of sizes | `bid-offer-midpoint` needs a provider-verified quote time; today's `updatedAtDate` is a row-update time and qualifies only if its price-observation meaning is documented |
| Last trade | `lastPrice` with date-only `tradeDate` | Prefer trade time with intraday precision | `last-trade` uses the actual trade time, never a row-update time; date-only trades cover the whole Auckland day |
| Prior settlement | `priorSettlement` with no session identity | Settlement session/date must be present | Without verified session identity it stays in the v1 comparison but is ineligible for history |
| Activity context | `tradedVolume`, `priorDayOpenInterest` | Same | Never establishes a price time |
| History depth | Only what our own collection has observed since it began | Available backfill depth and permission to store/redistribute derived history | Weekly and since-announcement baselines need at minimum multi-week coverage; actual coverage is displayed honestly |
| Raw evidence archival | Each successful source result archived before publish | Permitted retention duration (or documented unlimited retention) with expiry cleanup | If raw retention is not permitted: parsed provenance only, replay declared unavailable |
| Public display and derived outputs | Blocked (see above) | Billboard/redistribution agreement or written permission covering derived outputs | — |
| Official announcement history | Latest priced row parsed from Fonterra's page | Reuse basis for Fonterra pages | Dated, season-labelled priced announcements; no-change notices are events, not prices |

**Effective-time semantics** (from the next-release plan): observation identity
is (series, provider, contract/period, basis, source-effective instant-or-date).
Identical payloads for that identity deduplicate; a changed payload creates an
immutable revision; a newer retrieval or check alone is never a new
observation. Date-only observations cover the entire Auckland day. Check
outcomes stay separate from observations.

## Who owns the data

- Under the April 2021 NZX–SGX partnership, NZX delisted its dairy derivatives
  and equivalent contracts have traded **exclusively on SGX since
  29 November 2021** (nzx.com/markets/nzx-dairy-derivatives).
- SGX's Market Data Policy (effective 1 July 2026) §2 defines
  **"SGX-NZX Dairy Derivatives" as its own Market Data Segment** — MKP quotes
  are SGX market data, even when viewed on an NZX-branded page.
- NZX's Market Data Fees schedule (1 January 2026) has **no dairy-derivatives
  display licence**; its dairy market-data page defers settlement prices to
  sgx.com. The NZX Global Dairy Trade licence (NZ$2,000/month) covers GDT
  auction information only — it does **not** cover dairy futures quotes.

## Governing terms

1. **SGX Market Data Policy** (effective 1 July 2026, datadirect.sgx.com):
   - §3.1.2 — a Licensee "shall not disseminate or distribute the Market Data
     to any person without first entering into a Redistribution Agreement
     directly with SGX".
   - §5.1 fee categories include "(a) Redistribution License fees for
     redistribution of real-time, delayed or end-of-day services" and
     "(f) Billboard public display (applicable for delayed Market Data only)".
   - §4.1 — monthly usage reporting for display usage. Contact:
     data@sgx.com.
2. **NZX website terms of use** (nzx.com/meta-pages/terms-of-use): the IP
   clause permits using the site only "to view information about our products
   and service and NZX" — scraping the quotes page and republishing its values
   is outside that permission, and even linking to nzx.com "may not [be done]
   without our consent" (data@nzx.com). Dairy derivatives data queries:
   derivatives@nzx.com.

## Indicative costs

Vendor per-user pricing (CQG published table, SGD, Oct 2026): SGX-NZX Dairy
Derivatives **SGD 46/user/month real-time**, **SGD 9/user/month 10-minute
delay**. Direct Redistribution Agreement fees are quoted by SGX on request.
Our use case — one delayed value per contract per day, non-advertising —
should qualify for the delayed/Billboard display category, the cheapest tier;
confirm with SGX before relying on it.

## What lifts the gate

1. A signed SGX Redistribution/Billboard agreement for the SGX-NZX Dairy
   Derivatives segment (or written confirmation from SGX that the proposed use
   is permitted), **and** NZX's consent for use of and linking to its quotes
   page.
2. Record the agreement (or the confirmation email) in this file with its
   date and scope.
3. Re-enable `workers_dev` / `preview_urls` in both wrangler configs and
   complete the human-review checkpoint in `tasks/first-release/todo.md` — the e2e gate
   will pass once, and only once, the flags are intentionally flipped.

## Sources (checked 23 September 2026)

- https://www.nzx.com/markets/nzx-dairy-derivatives (exclusive SGX listing since 29 Nov 2021)
- https://www.nzx.com/services/products-tools/data-connectivity/nzx-market-data/data-licensing
- https://assets.ctfassets.net/m5mydry9e35f/3PNkOM6zdOvNmYN3tns0is/685f376c97a978127516d21eb3b417e5/Market_Data_Fees_2026_v2.pdf
- SGX Market Data Policy, effective 1 July 2026: https://cdn.databp.com/tenants/sgx/documents/2ae33c20-3d4c-11f1-9fd6-43b28f5cb868/Singapore%20Exchange%20Limited%20%28SGX%29%20Market%20Data%20Policy%20%28Effective%201%20July%202026%29.pdf (also https://www.datadirect.sgx.com/Market-Data-Policy)
- https://www.nzx.com/meta-pages/terms-of-use
- https://www.cqg.com/partners/exchanges/market-data-fees/singapore-dollar (indicative per-user vendor fees)
