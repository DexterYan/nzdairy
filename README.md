# NZ Dairy

MilkCompass is an English-language decision page for New Zealand Fonterra suppliers. It compares Fonterra's current-season farmgate milk price forecast with a timestamped MKP futures reference and translates price differences into annual gross milk revenue under editable scenarios.

The first release is implemented: Fonterra and NZX MKP parsers, a scheduled collection Worker (06:00 UTC) writing private versioned snapshots to R2, and the comparison/calculator page (Next.js App Router, TypeScript, OpenNext on Cloudflare Workers). Local web previews render a fixture-seeded snapshot, while the collector itself always fetches the live sources; operational readiness of scheduled collection in a provisioned environment is not yet verified. Public deployment is blocked until NZX/SGX display rights are documented. Active work follows the [next-release engineering contract](docs/next-release-plan.md) — market changes and farm impact ([tasks](tasks/next-release/todo.md)).

## Development

```bash
npm run dev            # local dev server
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # vitest (single run)
npm run build          # next build
npm run build:worker   # OpenNext bundle for Cloudflare Workers
npm run preview        # local Workers preview of the production bundle
npm run dev:collector  # collection Worker with scheduled-handler testing
npm run seed:snapshot  # seed local R2 with the fixture snapshot
npm run test:e2e       # journey + degraded-state checks against the preview
```

Run `npm run seed:snapshot` once before `npm run preview` to see comparison values; local R2 state persists under `.wrangler/`. Two Workers are configured: `wrangler.jsonc` (web, reads snapshots from R2) and `wrangler.collection.jsonc` (scheduled collector, daily at 06:00 UTC, archiving each source result before publishing the combined snapshot). Public deployment is blocked until NZX/SGX display rights are documented — see [Operations](docs/operations.md).

Node 22 and npm are the toolchain; `package-lock.json` is committed.

### Dependency policy

- All dependencies are pinned to exact versions. Upgrades are deliberate, reviewed changes — never incidental.
- The `next` version must stay within the peer range of `@opennextjs/cloudflare` (the Cloudflare adapter, added with the runtime task). Check that range before any Next.js upgrade.

### Generated files

`node_modules/`, `.next/`, `.open-next/`, `.wrangler/`, `coverage/`, `next-env.d.ts`, and `*.tsbuildinfo` are generated and never committed. `next-env.d.ts` is recreated by `next dev` and `next build`.

## Documents

- [Next-release plan: market changes and farm impact](docs/next-release-plan.md)
- [Next-release presentation design](docs/next-release-design.md)
- [Implementation plan](docs/implementation-plan.md)
- [Operations](docs/operations.md)
- [Data rights](docs/data-rights.md)
- [UI preview](docs/ui-preview.md)
- [First-release tasks](tasks/first-release/todo.md)
- [Next-release tasks](tasks/next-release/todo.md)
