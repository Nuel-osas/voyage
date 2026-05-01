# Data Model

This document explains the Convex schema in `packages/convex/schema.ts` — what each table is for, why the fields exist, and how the indexes serve specific access patterns.

The schema is the single most important contract in the system. The ingest-bridge writes into it, the matchers read from it, the replay-engine writes results back, and the dashboard subscribes to it. Anything ambiguous about the schema causes pain in five places.

---

## `tx_event`

The filtered transaction log. Populated only by the ingest-bridge HTTP endpoint after source-side filtering (see ADR 0002).

### Fields

- `digest` — Sui transaction digest. Globally unique. Indexed.
- `checkpoint` — checkpoint sequence number this transaction was included in. The primary time axis. Indexed.
- `timestampMs` — wall-clock time of the checkpoint (not the transaction). Used as a tiebreaker for ordering within a checkpoint.
- `sender` — Sui address that signed the transaction. Indexed for matchers that look at attacker behavior across multiple transactions.
- `touchedSharedObjects` — sorted array of shared object IDs the transaction mutated. Sorting makes equality checks deterministic without a hash.
- `valueDelta` — only the value-bearing portion of the transaction effects. Each entry is `{ objectId, objectType, deltaMicroSui }`. Full effects are referenced by `digest` and fetched from a Sui RPC if a matcher or reviewer needs them.
- `flags.touchesDex` / `touchesOracle` / `touchesLending` — boolean fast-paths for matchers. Computed by the bridge using the curated registries.
- `flags.isMultiHop` — true if the transaction calls into more than one programmable transaction block leg or routes through a multi-hop swap.
- `gasUsed` — gas consumed in microSUI. Used by JIT and sandwich heuristics.
- `ingestVersion` — bridge filter logic version. If the bridge is updated to capture a wider filter, replays of historical checkpoints write rows with a higher `ingestVersion`, replacing older rows.

### Why these fields and not others

- We do not store full transaction effects. They are large and rarely needed; matchers operate on summaries.
- We do not store contract call arguments. Move package and function names are inferred via `objectType` lookups when needed.
- We do not store gas price separately. Gas used in microSUI already collapses price and units.

---

## `object_timeline`

A materialized view: per-object access history.

Most matchers ask the same question repeatedly: "what touched object X in the last N checkpoints?" Computing this from `tx_event` would require scanning by checkpoint and filtering by `touchedSharedObjects`, which is a linear scan.

Instead, we write one timeline row per (transaction, shared object) pair at ingest time. Indexed by `(objectId, checkpoint)`. The shared-object-sandwich matcher uses this to look up all transactions touching a pool in O(window-size-per-object) rather than O(window-size).

Trade-off: write amplification. A transaction touching 4 shared objects produces 1 `tx_event` and 4 `object_timeline` rows. This is acceptable because filtered ingest typically yields <200 transactions per checkpoint.

---

## `tx_embeddings`

Compact transaction-shape embeddings for similarity search.

Convex's vector index has dimensionality limits and per-record size constraints. Rather than compromise, we keep embeddings small (192-dim) and capture transaction shape, not transaction content:

- Touched object types (one-hot over a curated vocabulary).
- Value flow shape (which entries in valueDelta are positive, negative, large, small).
- Call depth and PTB structure summary.
- Gas usage tier.

The encoder lives in `packages/pattern-matchers/src/embedding.ts` (planned). Larger experiments — full effect-tree embeddings, learned representations — happen offline against checkpointed exports rather than in-place.

The `modelVersion` filter field lets us reindex incrementally: when the encoder changes, we write new rows with a new version, then delete old ones once the dashboard is reading the new version exclusively.

---

## `finding`

The output of the lab. A `finding` is created when a pattern matcher produces a candidate; it transitions through states as replay confirms or rejects it.

### State machine

```
unverified  →  replaying  →  verified  →  disclosed
                          ↘  rejected
```

- **unverified:** matcher produced this candidate; replay has not run.
- **replaying:** replay-engine has claimed the job.
- **verified:** replay confirmed extraction. `replayResult.confirmed === true`.
- **rejected:** replay ran cleanly but found no extractable value. Kept for false-positive analysis.
- **disclosed:** verified finding has been formally communicated to the affected party.

The dashboard's default view shows only `verified` findings. Reviewers can opt into `unverified` and `rejected` for tuning matchers.

### `matcherDetail`

Free-form per-matcher detail. We deliberately do not enforce a schema on this column at the database level — each matcher decides what evidence is relevant. The matcher's TypeScript type asserts the shape, and the dashboard renders it via per-matcher UI components.

---

## `replay_queue`

Decoupled from `finding` so the queue can be inspected, retried, and drained independently.

Every replay attempt increments `attempts`. After 3 failed attempts a finding is left in `replaying` state with a paging alert. Manual intervention is the right move at that point — repeated failures suggest a replay-engine bug, not a transient one.

---

## `ingest_watermark`

Single-row table tracking the latest checkpoint successfully recorded. Used by:

- The detection driver to bound the live window without scanning `tx_event`.
- The bridge to detect gaps on restart and replay missed checkpoints.
- The dashboard's health view to show ingest lag.

Single-row tables in Convex are awkward but cheap. The `scope: 'global'` field is a forward-compatibility hook in case we ever want per-shard or per-protocol-version watermarks.
