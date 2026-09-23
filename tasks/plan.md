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

The proposed scope, data decisions and quality rules are in
[`docs/next-release-plan.md`](../docs/next-release-plan.md). Tasks 13–22 in
[`tasks/todo.md`](todo.md) extend the existing checklist without replacing prior
release gates.

```text
Source/access decision (13) -> Observation contract (14)
  -> Auditable publication (15) -> Historical changes (16)
  -> Farm-impact history UI (17) -> Quote evidence (18)
  -> FX context (19) -> Milk collections (20) -> Conditional GDT context (21)
  -> Integrated release verification (22)
```

Checkpoints follow Tasks 15, 18 and 21. Fixture implementation can proceed while
rights are unresolved; production use cannot. Unavailable context sources may be
explicitly deferred without blocking the core release. Current-season history is
the proposed scope extension; proprietary forecasting remains deferred.
