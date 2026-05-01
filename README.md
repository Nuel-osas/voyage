# voyage

A scanner for MEV on Sui mainnet.

Sui claims its parallel-execution architecture eliminates traditional MEV. As far as I can tell, nobody has tested that publicly with any rigor. This is an attempt.

The lab ingests filtered mainnet checkpoints into Convex, runs pattern matchers against the ingested transactions, replays candidates against forked Sui state to confirm extracted value, and surfaces verified findings through a reviewer dashboard with a coordinated-disclosure path.

If something is found, it's a paper, a bounty, and a tool. If nothing is found, it's the first formal benchmark of the claim.

## Layout

```
voyage/
  packages/
    convex/             reactive backend, schema, scheduled detection, http ingest
    ingest-bridge/      rust worker: sui rpc -> filter -> convex http
    pattern-matchers/   pure-function detectors, no convex dependency
    replay-engine/      rust binary, reruns candidates against forked state
    dashboard/          next.js review surface
  docs/
    adr/                architecture decision records
    data-model.md       why the schema looks the way it does
    mev-patterns.md     hypotheses + detection criteria
    milestones.md       6-week plan
```

## Why this stack

The architecture is shaped by a single constraint: one engineer, six weeks, then maintenance. That ruled out anything where I'd spend two weeks on plumbing.

Convex sits at the center because it collapses what would otherwise be Postgres + Redis + a vector index + cron + a websocket layer into one service with one type system. The reactive query model is the right shape for a tool with multiple consumers (dashboard, scheduled rematching, replay completion, reviewer notifications). I'm not trying to make Convex do everything though, see ADR 0001.

Throughput-bound work sits at the Rust edges. Sui peaks around 7K TPS and our filter walks effect dependency graphs. That's not work I want to do in a TypeScript Convex function. The ingest-bridge lives in front of Convex, not inside it.

Replay verification sits in another Rust worker because correctness here means linking against the canonical Move VM, not an approximation of it. A 30-second replay is also the wrong shape for a Convex action.

Pattern matchers are pure functions. They don't import Convex. The action that drives them is a thin shell. This means I can unit-test a matcher in milliseconds and run the same matcher offline against historical data without changes.

## Status

Scaffolding is in. First end-to-end slice (real checkpoint -> matcher -> verified finding in dashboard) is the week-1 target.

## License

Apache-2.0 once code starts running. Findings released under coordinated disclosure.
