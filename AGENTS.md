# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Repository Status

Early implementation stage — the Next.js/TypeScript toolchain (Task 1) is complete. The repo contains the reviewed implementation plan, a layout-only UI preview, the task checklist, and the application scaffold. `docs/implementation-plan.md` is the authoritative product and architecture plan; `tasks/todo.md` is the executable task checklist (with acceptance criteria and verification steps per task); `tasks/plan.md` maps the dependency chain between tasks. Read the implementation plan before making product or architecture decisions.

## What Is Being Built

MilkCompass: one English-language page for New Zealand Fonterra suppliers comparing the current season's official farmgate milk price forecast with a timestamped NZX MKP milk-price futures reference, translating price differences into annual gross milk revenue under three editable scenarios.

## Planned Architecture

(From `docs/implementation-plan.md` — implement to match.)

- **Next.js App Router + TypeScript + npm**, deployed via **OpenNext on Cloudflare Workers**. CSS Modules and accessible native controls; no charting library in the first release.
- **Two Workers**: the web Worker serving the page, and a separate scheduled collection Worker (daily at `06:00 UTC`) writing private versioned snapshots to **R2**. The page reads the latest snapshot through a server-side binding; revenue calculations run in the browser.
- **Parsers** for Fonterra's forecast page and NZX MKP quotes are adapted from the proof of concept in `cot-analysis/tools/dairy` (separate repo) — retain attribution, drop unrelated WMP/GDT reporting.
- **Season logic**: June–May season determined in `Pacific/Auckland`; the futures reference must match the exact current-season MKP contract, never a substitute season.

## Commands

`npm run typecheck`, `npm run lint`, `npm test` (Vitest), `npm run build` exist (Task 1). `npm run build:worker` (OpenNext bundle) and `npm run test:e2e` arrive with their tasks.

## Hard Constraints

- **Public deployment is blocked** until NZX/SGX market-data display rights are documented. Use fixtures or restricted previews meanwhile.
- Data quality rules in the implementation plan are contract, not suggestion: validate `low <= midpoint <= high`; prefer two-sided bid/offer midpoint, then positive last trade with trade date, then positive prior settlement; always display the selected basis; reject crossed/wrong-currency/expired/wrong-season contracts; keep source, quote, trade, and retrieval timestamps distinct; on partial failure retain the previous valid value with its original timestamp; quotes older than 72 h are "old", collection checks older than 36 h are "stale".
- Missing prices never become zero prices or zero revenue. Blank/negative/non-finite inputs produce no results.
- Out of scope for the first release: accounts, database, probability bands, advice, alerts, historical charts, additional seasons, hedging.

## Working Agreements

- **Simplicity & minimal impact** — touch only what the task needs. Find root causes; no temporary fixes.
- **Plan first for non-trivial work** — 3+ steps or architectural decisions go in `tasks/todo.md`. Re-plan if things go sideways.
- **Verify before done** — tests, logs, or behavior diff. "Looks right" isn't enough.
- **Use subagents** for research/exploration to keep main context clean.
- **Capture lessons** after corrections in `tasks/lessons.md`.

### Anti-waffle rule for comments

A comment earns its lines by saying what the code can't.

Max 2 lines. If it needs more, it belongs in this file. Say why — the constraint, the trap, the cross-repo contract. Never restate what the next line already says (secretGenerator + envs: already say "a Secret built from a dotenv file"). One fact per comment, sitting on the line it explains. Two unrelated facts = two comments in two places, not one paragraph at the top. Drop any clause a reader could infer from the value below it, and cut hedges and connectives: "note that", "essentially", "in other words", "which means ... so ...".

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
