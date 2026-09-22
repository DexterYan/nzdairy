# NZ Dairy

MilkCompass is a planned English-language decision page for New Zealand Fonterra suppliers. Its first release will compare Fonterra's current-season forecast with a timestamped milk-price futures reference and translate price differences into annual milk revenue.

This repository contains the reviewed implementation plan, a layout-only preview, and the application scaffold (Next.js App Router, TypeScript). Data integration has not started.

## Development

```bash
npm run dev        # local dev server
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest (single run)
npm run build      # next build
```

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
