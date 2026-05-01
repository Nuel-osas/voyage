# Architecture

The system has four jobs:

1. Pull a useful subset of Sui mainnet into a place we can query reactively.
2. Run pattern matchers against that data on a schedule.
3. Verify any candidate finding by replaying it against forked Sui state.
4. Surface findings to a reviewer with a disclosure workflow attached.

Everything else flows from those four.

## Layers

### Ingest

The `ingest-bridge` (Rust) subscribes to Sui's checkpoint stream, filters at the source, and posts batches to a Convex HTTP endpoint.

Filter passes if the transaction mutates a shared object, touches a known DEX pool, touches a known oracle, or matches a sandwich-shape signature inside the checkpoint. Everything else is dropped before it crosses the boundary. ADR 0002 covers why.

The bridge is single-threaded on purpose. Sui's cadence is well within what one async task handles, and serializing prevents out-of-order writes downstream.

### Convex

The system of record. Six tables: `tx_event`, `object_timeline`, `tx_embeddings`, `finding`, `replay_queue`, `ingest_watermark`. Schema is in `packages/convex/schema.ts`, rationale is in `docs/data-model.md`.

Convex also owns:

- A scheduled action that runs detection over a rolling window every 30 seconds.
- HTTP endpoints (currently just ingest).
- The reactive query layer the dashboard subscribes to.

It does not own ingest throughput, replay execution, or pattern logic. Those live elsewhere.

### Pattern detection

Matchers are pure functions: `(window, context) => candidates[]`. No side effects, no Convex imports.

The Convex action loads a window, calls each matcher, and persists candidates. Matchers themselves can be tested in isolation and run offline against historical exports without modification. ADR 0004.

Patterns shipped in v1: shared-object sandwich, oracle frontrun. Atomic cross-DEX arbitrage and JIT liquidity are specced in `docs/mev-patterns.md` for v2.

### Replay

A candidate is not a finding. The `replay-engine` (Rust) loads object state at the slot before the candidate, replays the canonical transaction order, replays the proposed adversarial order, diffs the value-bearing object states, and writes back an extraction estimate.

It runs as a worker pool subscribing to the `replay_queue` table. Convex schedules; the engine executes. ADR 0003.

### Review

The dashboard is Next.js with a Convex subscription. It owns no state beyond what's in URL params. Findings, severity rankings, similar-transaction panels, disclosure workflow - all read out of Convex queries.

## Lifecycle of a finding

1. Checkpoint N lands.
2. Bridge pulls 213 transactions, filters to 47, posts to Convex.
3. `recordCheckpoint` writes `tx_event` rows and updates `object_timeline`.
4. The detection action fires, runs matchers over the rolling 5-minute window.
5. The shared-object-sandwich matcher returns one candidate.
6. A `finding` row lands in state `unverified`. A `replay_queue` job is enqueued.
7. A replay worker claims the job, reruns the slot with and without the candidate's adversarial transactions, computes extracted value.
8. Result lands in `finding.replayResult`. State transitions to `verified` or `rejected`.
9. Dashboard reactive query updates. Reviewer is notified. Disclosure clock starts.
10. Reviewer accepts the finding, drafts disclosure, marks ready. Manual gate sends.

## Quality bars

- No unverified candidates reach the dashboard. The replay gate is non-negotiable.
- Every boundary is idempotent. Re-running ingest is safe. Re-running detection is safe.
- Detection is deterministic. Same window in, same candidates out.
- Findings are private until a reviewer explicitly approves disclosure.

## Open questions

- Cold storage strategy past the rolling window.
- Whether to publish a redacted public view of the dashboard alongside the private one.
- Embedding model for transaction shapes - the v1 hand-rolled feature vector is probably too crude. Sentence-embedding the effect tree is the obvious next experiment, but expensive.
