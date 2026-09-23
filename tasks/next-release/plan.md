# Next Release: Market Changes and Farm Impact

The engineering plan is [docs/next-release-plan.md](../../docs/next-release-plan.md).
[Claude review decisions](../../docs/next-release-review.md) explain the revised Tasks
13–22 in [todo.md](todo.md); existing release gates remain intact.

## Dependency Chain

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
