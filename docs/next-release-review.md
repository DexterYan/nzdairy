# Next-release plan review decisions

Reviewed 2026-09-24 using the user-requested `claude -p` CLI, with read-only
Read/Glob/Grep tools. The reviewer inspected the proposed plan, Tasks 13–22,
existing contracts, parsers, collector, snapshot reader, calculator and e2e script.
Its findings are review input, not independent verification of provider claims.
This record summarises the returned findings and their disposition; it is not a
verbatim transcript. Changes are planning/documentation only.

## Findings addressed

| Review ID | Finding | Resolution |
|---|---|---|
| H1 | No task owns the web manifest/history read path. | Task 15c explicitly updates `app/page.tsx` and tests bounded fallback. Task 15b preserves the v1 mirror throughout migration. |
| H2 | The strict v1 parser drops unknown fields and rejects new schema versions. | Keep `latest.json` v1; store manifest/history/context separately and use a new loader. Test old-reader compatibility in Task 14. |
| H3 | External provider selection blocks design and fixture implementation. | Split 13a requirements, 13b presentation design and 13c production-feed selection. Only actual provider use waits on 13c. |
| M1 | Deduplication identity is unspecified. | Define effective-time identity, revision payloads, same-price/new-time observations and activity-only row updates. |
| M2 | Historical eligibility is confused with current freshness. | Old verified baselines remain eligible, including backfills; failed/retained/stale current checks and old effective endpoints suppress fresh summaries. |
| M3 | Calendar arithmetic timezone is unspecified. | All cutoffs and lookback windows use `Pacific/Auckland`, with DST boundary tests. |
| M4 | Forecast-step history has no assigned source/parser work. | Task 15a extracts and validates current-season announcement rows from the existing Fonterra table; unreadable rows remain gaps. |
| M5 | Date-only last trades have no cutoff rule. | Represent date-only observations as full-day intervals; require the entire interval to precede the cutoff. |
| M6 | Collector history rollover lacks a test. | Task 15b tests May 31/June 1 2027 with only new-season observations and unchanged old objects. |
| M7 | Runtime/fixture checks arrive too late. | Contract, collector, reader and fixture changes run Workers/e2e checks in the same slice. Separate SSR/HTTP evidence from real-browser interaction checks. |
| M8 | Seven scheduled runs start only at release completion. | Start after publication is ready and access/environment permit; record results at Task 22. Pipeline changes restart the run, UI-only changes do not. |
| L1 | All tasks have the same adapter-specific scope warning. | Replace it with per-task estimates; split 15 and 17 into focused sub-tasks. |
| L2 | Extending SPEC.md would blur its completed design-extension boundary. | Keep SPEC.md intact; this next-release plan becomes the engineering contract once approved, with a separate next-release design document. |
| L3 | Context freshness has no implementable threshold. | Define next-expected publication and numeric grace fields; each adapter must document exact cadence before claiming freshness, otherwise show schedule unknown. |
| L4 | Raw-data retention has no enforcement criterion. | Require per-source rules and expiry tests or documented unlimited retention; allow non-replayable parsed evidence when raw retention is unavailable. |
| L5 | Quote evidence is unnecessarily blocked on history UI. | Task 18 depends on design, then integrates at the core checkpoint. |
| L6 | The frozen-fixture footer becomes misleading for collected data. | Task 15c carries explicit provenance through the loader and replaces the hardcoded label; legacy unknown provenance is not guessed. |

## Recommendations refined rather than copied

- Moving a date-only trade to the previous day would falsely backdate evidence.
  Keep its actual interval and exclude it if it overlaps the cutoff.
- A 72-hour age test at retrieval would exclude legitimate historical backfills.
  Separate verified historical evidence from request-time endpoint freshness; include
  tests for both a valid old baseline and an old current endpoint that cannot support
  a fresh-change claim.
- New-season history is not necessarily empty: a verified opening announcement may
  already exist. Test absence of prior-season carry-forward, not unconditional emptiness.
- The reviewer proposed a generic monthly threshold as an example. Require a justified
  source-specific schedule/grace instead; unknown schedules get explicit wording.
- The review said only fetch-source sees the raw body; the collector already receives
  `officialFetch.body` and `futuresFetch.body`. No fetch-interface rewrite is required
  solely to archive evidence. Replacement provider adapters may still need their own slice.
- No automatic provider outreach was added. Task 13c documents the decision and still
  requires separate authority for messages or purchases.

## Additional consistency fixes

The revised plan defines manifest commit order, compatibility-mirror failure,
previous-release fallback, conditional publication for overlapping runs, and
season-scoped rollback. It keeps production state in RevenuePanel and assigns
context a separate optional publication contract so a failed context feed cannot
block core prices. Context Tasks 19–21 have no dependency on each other.

## Verification of this revision

- Existing Tasks 1–12 and first-release launch gates are preserved.
- Plan/dependency index/checklist agree on sub-task IDs and mandatory dependencies.
- Local Markdown links resolve; future implementation files are listed as proposed.
- `git diff --check` passes. No application code was changed or runtime tests claimed.
