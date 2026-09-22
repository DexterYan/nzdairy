# NZ Dairy

MilkCompass is a planned English-language decision page for New Zealand Fonterra suppliers. Its first release will compare Fonterra's current-season forecast with a timestamped milk-price futures reference and translate price differences into annual milk revenue.

This repository contains the reviewed implementation plan, a layout-only preview, and the application scaffold (Next.js App Router, TypeScript, OpenNext on Cloudflare Workers). The page currently renders a fixture snapshot; live data integration has not started.

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
```

Run `npm run seed:snapshot` once before `npm run preview` to see comparison values; local R2 state persists under `.wrangler/`. Two Workers are configured: `wrangler.jsonc` (web, reads snapshots from R2) and `wrangler.collection.jsonc` (scheduled collector, daily at 06:00 UTC, logic arrives with Task 7).

Node 22 and npm are the toolchain; `package-lock.json` is committed.

### Dependency policy

- All dependencies are pinned to exact versions. Upgrades are deliberate, reviewed changes — never incidental.
- The `next` version must stay within the peer range of `@opennextjs/cloudflare` (the Cloudflare adapter, added with the runtime task). Check that range before any Next.js upgrade.

### Generated files

`node_modules/`, `.next/`, `.open-next/`, `.wrangler/`, `coverage/`, `next-env.d.ts`, and `*.tsbuildinfo` are generated and never committed. `next-env.d.ts` is recreated by `next dev` and `next build`.

## Documents

- [Implementation plan](docs/implementation-plan.md)
- [UI preview](docs/ui-preview.md)
- [Implementation tasks](tasks/todo.md)
