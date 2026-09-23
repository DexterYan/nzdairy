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
