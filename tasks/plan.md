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
