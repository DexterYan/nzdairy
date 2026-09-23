# MilkCompass First Release

The authoritative product and implementation plan is in [`docs/implementation-plan.md`](../docs/implementation-plan.md). The executable checklist is in [`tasks/todo.md`](todo.md).

## Delivery Phases

1. Foundation: application toolchain and Cloudflare runtime.
2. Source integration: official forecast and futures reference.
3. Farm interaction: revenue calculations and editable scenarios.
4. Operations and polish: scheduled collection, degraded-data handling, accessibility, and release verification.

## Dependency Chain

```text
Toolchain
  -> Cloudflare runtime and fixture page
      -> Fonterra forecast
          -> MKP futures reference
              -> Revenue calculator
                  -> Editable scenarios

MKP futures reference
  -> Scheduled collection and recovery

Editable scenarios + Scheduled collection
  -> Release verification
```

## Design Extension (2026-09)

Builds the UI specified in [`docs/design.md`](../docs/design.md) (seeded design pass).
The release's public-deployment gate is unaffected.

5. Design extension: design tokens and card refinements, comparison strip,
   stat tiles, production slider.

```text
Release verification
  -> Design tokens and card refinements (Task 9)
      -> Comparison strip (Task 10)
      -> Stat tiles (Task 11)
          -> Production slider (Task 12)
```

Task 10 and Task 11 are independent of each other and could run in parallel
sessions; Task 12 shares `revenue-panel.tsx` with Task 11 and follows it.

## Next Release: Market Changes and Farm Impact

The engineering plan is [docs/next-release-plan.md](../docs/next-release-plan.md).
[Claude review decisions](../docs/next-release-review.md) explain the revised Tasks
13–22 in [tasks/todo.md](todo.md); existing release gates remain intact.

```text
13a Requirements -> 14 Contracts -> 15a Forecast history -> 15b Publication
                                                        -> 15c Web reader
14 -> 16 Comparable changes -------------------------------> 17a Impact UI
15c Web reader --------------------------------------------> 17a
13b Next-release design -----------------------------------> 17a -> 17b Chart
13b -> 18 Quote evidence ----------------------------------> Core checkpoint
13c Provider selection -> production access only
Core checkpoint -> independent optional 19 / 20 / 21 -> 22 Release
```

Fixture work depends on documented requirements, not commercial provider selection.
Keep latest.json v1 compatible; explicitly migrate app/page.tsx to the new loader.
Start restricted scheduled-run evidence after 15b when access/environment permit.
Quote evidence can be implemented ahead of history; coordinate shared-file edits.
Context cards have no dependencies on each other; each may be explicitly deferred.
Checkpoints cover publication/read migration, the core journey, and included context.
