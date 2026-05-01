# ADR 0003: Replay Engine as External Rust Worker, Not a Convex Action

**Status:** Accepted
**Decision drivers:** correctness, cost, runtime characteristics

## Context

A finding from a pattern matcher is only a candidate. To call it a finding worth reporting, we must replay the candidate against the same forked Sui state and confirm that the proposed extraction would actually produce value. This is the verification gate.

Replay requires:

- The canonical Sui Move VM execution semantics.
- Linking against `sui-execution`, `move-vm`, and the relevant Move stdlib at the exact protocol version active at the candidate slot.
- Loading object state at the slot before the candidate and replaying transactions in controlled orderings.
- Diffing object state to compute extracted value.

Replay times observed in practice range from 5 seconds (simple swap candidate) to 60+ seconds (complex multi-leg arbitrage candidate touching 12+ objects).

Two options were considered:

1. **Convex action with bundled WASM-compiled Move VM.** Run the entire replay in-process inside a Convex action.
2. **External Rust worker.** Convex enqueues replay jobs; a separate Rust binary executes them.

## Decision

External Rust worker.

- Convex schedules replay jobs into a `replay_queue` table on finding creation.
- The replay-engine binary subscribes to Convex via a long-lived query for unclaimed jobs.
- It claims a job atomically (Convex mutation), executes the replay locally, writes the result back into `finding.replay_result`, and marks the job complete.
- A worker pool of 2-4 replay processes runs against a single Convex deployment; horizontal scaling is straightforward.

## Consequences

### Positive

- Replays use the canonical Move VM, not a re-implementation. Verification correctness is anchored to the same code Sui validators run.
- 30-60 second jobs run on cheap commodity compute, not Convex action time.
- Worker pool can scale independently if a replay backlog forms.
- Replay determinism is testable in isolation — the worker can be run against a captured queue and produce byte-identical results.

### Negative

- More moving parts. The replay-engine is a separate binary to build, deploy, and monitor.
- Latency between candidate creation and replay completion has two hops (matcher → queue → worker → result).
- Worker pool requires its own minimal infrastructure (a single VM is enough; a Docker container is enough).

### Mitigations

- Treat the replay-engine as a single-binary deployment with no state of its own. Deploys are atomic.
- Convex query subscriptions give us push-style job pickup with sub-second latency in the common case.
- Health check: track p95 queue dwell time as a Convex query; alert on regression.
