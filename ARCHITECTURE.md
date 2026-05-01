# Architecture

This document describes the design of the Sui MEV Discovery Lab. It is the source-of-truth for cross-package decisions; package-local details live in each package's README.

---

## Goals

1. Continuously ingest enough of Sui mainnet to detect MEV patterns without ingesting everything.
2. Run pattern detection in the same language as the schema (TypeScript) so detection logic and storage stay coupled.
3. Confirm any candidate finding by replaying it deterministically against forked Sui state — never report unverified candidates.
4. Surface findings through a reactive dashboard with a coordinated-disclosure workflow built in.
5. Be operable by one engineer.

---

## Non-Goals

- Real-time MEV extraction. This is a discovery and research tool, not a searcher.
- General-purpose Sui indexing. We index only what supports MEV detection.
- Comprehensive coverage of every transaction. We accept selection bias in exchange for tractable cost.
- Historical backfill beyond a rolling window. Cold-storage of older data is out of scope for v1.

---

## System Layers

### 1. Ingest

Owned by `packages/ingest-bridge` (Rust).

The ingest-bridge subscribes to Sui's checkpoint stream via a dedicated full-node JSON-RPC endpoint. For each checkpoint it:

1. Pulls all transactions in the checkpoint.
2. Filters to transactions that mutate shared objects, touch known DEX/lending pools, interact with oracle objects, or follow sandwich-shape signatures (multiple sender addresses, same target object, same checkpoint).
3. Normalizes filtered transactions into the `tx_event` schema (see [`docs/data-model.md`](./docs/data-model.md)).
4. Batches and pushes to a Convex HTTP endpoint with idempotency keys.

**Why Rust at the edge:** Sui's checkpoint stream pushes high-throughput data and our filtering logic walks transaction effect dependency graphs. Doing this work in Convex would burn function-time on cheap filtering. Doing it in TypeScript would not keep up. Rust gives us the Move VM type bindings for free.

**Why HTTP and not direct DB writes:** Convex HTTP endpoints give us schema validation, idempotency, and observability at the boundary. Direct database writes would couple the bridge to Convex's internal write API.

### 2. Storage and Coordination

Owned by `packages/convex`.

Convex owns four logical stores:

- **`tx_event`** — normalized transactions filtered by ingest-bridge. Indexed by checkpoint, sender, touched objects.
- **`object_timeline`** — per-object access history. A materialized view derived from `tx_event` on insert.
- **`tx_embeddings`** — vector embeddings of transaction shapes (192-dim). Indexed for similarity search against MEV signature corpus.
- **`finding`** — candidate findings produced by pattern matchers. Includes severity, replay status, reviewer assignment, disclosure state.

It also owns:

- **Scheduled actions** — pattern matchers run on a fixed cadence over rolling windows.
- **HTTP ingest endpoints** — the bridge's only entry point.
- **Reactive queries** — every dashboard view subscribes to a Convex query; updates propagate automatically.

**Why Convex over Postgres+Redis+pgvector+cron:** the system has five reactive consumers (live dashboard, reviewer notifications, scheduled rematching, replay completion alerts, disclosure state changes). Building this on a stack of independent services costs more in glue code than the whole system costs in Convex. The lab is also a public Convex case study, which has its own strategic value.

### 3. Pattern Detection

Owned by `packages/pattern-matchers` (TypeScript), invoked from Convex actions.

Pattern matchers are pure functions: `(window: TxEvent[]) → CandidateFinding[]`. They have no side effects and no Convex dependencies. This lets them be:

- Run inside Convex scheduled actions on rolling live windows.
- Run offline against full historical data via a Node.js batch script.
- Unit-tested without spinning up Convex.

The corpus of patterns is documented in [`docs/mev-patterns.md`](./docs/mev-patterns.md). v1 ships with: shared-object sandwich, oracle-update frontrun, atomic cross-DEX arbitrage, JIT liquidity, and shared-object reordering anomaly.

**Why pure functions:** any matcher that depends on Convex would be untestable and unportable. The stateful work (loading windows, writing findings) is owned by the Convex action that calls the matcher.

### 4. Replay and Verification

Owned by `packages/replay-engine` (Rust).

A finding from a pattern matcher is only a candidate. Verification requires replaying the candidate transaction(s) against the same forked Sui state and confirming that the proposed extraction would actually produce value.

The replay-engine:

1. Pulls historical state at the slot before the candidate.
2. Replays the original transaction(s) in their canonical order.
3. Replays them in the proposed adversarial order or with the proposed inserted attacker transaction.
4. Diffs the value-bearing object states.
5. Returns an extraction estimate in microSUI.

**Why a separate Rust binary, not a Convex action:** replays use the canonical Move VM, link against `sui-execution` crates, and can take 30+ seconds. Running this in Convex would cost more in function time than running a small worker pool. Convex schedules the replay job and stores the result; the work happens elsewhere.

**Communication:** Convex enqueues replay jobs in a `replay_queue` table. The replay-engine polls (or subscribes via a Convex query) and writes results back to `finding.replay_result`.

### 5. Review Surface

Owned by `packages/dashboard` (Next.js + Convex React).

The dashboard is a thin reactive client. It subscribes to:

- Live findings ranked by severity and replay-confirmed extracted value.
- Per-finding detail with raw transaction graph, replay diff, and similar historical patterns.
- Reviewer assignments and disclosure status.

It does no analytics of its own. Every aggregate it shows is computed by a Convex query.

**Why client-only state:** any state in the dashboard duplicates Convex. Two reviewers viewing the same finding must see consistent data. The fastest way to guarantee that is to keep the dashboard stateless.

---

## Data Flow End-to-End

A typical lifecycle for one candidate finding:

1. **Checkpoint N produced on Sui mainnet.**
2. ingest-bridge pulls and filters checkpoint N. Pushes 47 of 213 transactions to Convex via HTTP.
3. Convex `ingest.recordCheckpoint` mutation writes `tx_event` rows and updates `object_timeline`.
4. Scheduled action `detection.runMatchers` fires every 30 seconds over the rolling 5-minute window.
5. The shared-object-sandwich matcher detects a candidate: tx A frontruns tx B on shared object X, then tx C reverses A's position.
6. Convex writes a `finding` row with `state: 'unverified'` and enqueues a replay job.
7. replay-engine picks up the job, replays the slot with and without the proposed attacker pattern.
8. replay-engine writes back: extraction confirmed, +0.43 SUI extracted.
9. `finding.state` transitions to `'verified'`. Severity score computed from extracted value plus pattern frequency.
10. Dashboard reactive query updates. Reviewer is assigned. Disclosure timer starts.
11. Reviewer accepts the finding, drafts disclosure, marks ready-to-send.
12. Disclosure pipeline (separate, manual gate) sends coordinated notification to Sui Foundation.

---

## Quality Constraints

- **No unverified findings reach the dashboard.** A finding is only visible after replay confirms extraction.
- **Idempotency at every boundary.** Replaying ingest must be safe. Re-running a matcher must not duplicate findings.
- **Determinism in detection.** Matchers are pure functions over windows. Same window → same candidates.
- **Coordinated disclosure by default.** Findings are private until reviewed and explicitly approved for publication.

---

## What Is Not Yet Decided

- Cold-storage strategy for `tx_event` beyond the rolling window.
- Embedding model for transaction shapes — currently using a custom feature vector; experiment planned with sentence-embedding of the transaction effect tree.
- Public dashboard tier — whether to ship a redacted public read view alongside the private reviewer surface.

These are tracked in `docs/open-questions.md`.
