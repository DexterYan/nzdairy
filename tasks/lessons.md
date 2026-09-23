# Lessons

Corrections and non-obvious findings captured during the build. Read before
touching the related subsystems.

## Tooling

- **codex as a review gate** — invoke as `codex exec -s read-only "<prompt>" < /dev/null 2>&1 | tail -30` with a long timeout; the prompt must end with an explicit `VERDICT: PASS/FAIL` contract. Its sandbox sometimes cannot run the test suite (temp-dir EPERM) — it compensates with isolated `node -e`/`vm` probes, which have caught real defects twice; expect and accept "not independently verified" notes, and run the gates yourself.
- **wrangler scheduled-only Workers** — local cron triggers need `--test-scheduled` plus `curl /__scheduled?cron=...`; without it the trigger 500s with "Handler does not export a fetch() function". Pin an explicit `--port` when 8787 is taken by the web preview.
- **`react-hooks/set-state-in-effect`** — a post-hydration load (localStorage → state) fails the rule when `setState` is called synchronously in `useEffect`. Defer with `queueMicrotask` inside the effect; in tests, flush with `await act(async () => {})`.
- **Node's DOMException is not an `instanceof Error`** — detect aborts by `(error as {name?}).name === "AbortError"`, and make timeout-test fakes reject from the `abort` event or the promise never settles.

## Data and time

- **Persisted staleness flags freeze** — a `stale` boolean computed at collection time goes stale itself the moment retention kicks in. The 72-hour quote and 36-hour check rules are display rules: recompute them at request time from timestamps, and never trust a flag that was frozen at publish.
- **Expose failed checks, not just retained values** — retention preserves data timestamps by contract, so the page cannot tell "fresh" from "stale prior value" unless the collector persists per-source check records (`checkedAt`/`outcome`/`detail`) alongside the blocks.
- **NZX quote timestamps are Auckland wall clock, not UTC** — parsing them as UTC shifts every quote by 12 hours; the misencoding passed naive assertions until quote-age checks were written.
- **Timestamp validation needs a calendar check** — `Date.parse` normalizes impossible dates (`2026-09-31`); compare parsed Y/M/D back against the string, and cap epoch seconds (year 9999) so serializations never carry expanded years that break round-trips.

## Testing

- **React SSR splits adjacent text nodes with `<!-- -->`** — raw-HTML assertions must strip comment markers before matching (`$9.50` renders as `$<!-- -->9.50`); Next also splits CSS across chunks, so fetch and join all stylesheets before asserting on them.
- **Regex gates match commented-out code** — checking `"workers_dev": false` with a regex passes when the line is commented out and a real `true` sits elsewhere. Parse the JSONC (string-aware comment stripping, then `JSON.parse`) and assert the effective value `=== false`.
- **Verify display formats empirically** — pin test strings (`NZ$` prefix, half-up rounding, `en-NZ` date shapes) only after running the formatter in node; assumptions about Intl output were wrong more than once.
- **Scope assertions to the region under test** — an `includes` check against the whole page can pass from the wrong card; extract the specific card/section before asserting, and pin a "must NOT appear" counterpart so regressions in the tested path actually fail.
- **Test scripts need unconditional cleanup** — restore-steps placed before kill can orphan detached servers on throw; kill first (shared promise, bounded wait, SIGKILL escalation, signal handlers), restore after.
