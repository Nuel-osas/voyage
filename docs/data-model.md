# Data model

The Convex schema is in `packages/convex/schema.ts`. This is what each table is for and the choices baked into it that aren't obvious from reading the types.

## tx_event

Filtered transactions from mainnet. Bridge writes; matchers read. Indexed by checkpoint, sender, and digest.

A few choices worth flagging:

`touchedSharedObjects` is sorted before insert. Equality checks against object sets become string equality without a hash.

`valueDelta` is a summary, not full effects. Matchers don't need full effects, and full effects bloat row size. If a reviewer needs them, the dashboard fetches them from a Sui RPC by digest at read time.

`ingestVersion` exists because the bridge filter logic will change over time. When it does, the bridge replays affected checkpoints and writes rows with a higher version. The mutation replaces, not duplicates. Older versions are kept until we explicitly garbage-collect.

We don't store contract call arguments or full PTB structure. If a matcher ends up needing them, we'll add a `ptbSummary` field rather than dumping everything.

## object_timeline

Per-object access history. One row per (transaction, shared object) pair, written synchronously when `tx_event` is inserted.

The point of this table is to make "what touched object X in the last N checkpoints?" cheap. The shared-object-sandwich matcher asks this once per pool per window. Without this table it's a scan of `tx_event` filtered by `touchedSharedObjects` membership, which is linear in window size; with it, it's an index lookup.

Write amplification is the obvious cost. A transaction touching 4 shared objects produces 1 `tx_event` row and 4 `object_timeline` rows. Mainnet filtered ingest is small enough that this is fine.

## tx_embeddings

192-dim vectors capturing transaction shape: which object types are touched, sign of value flow, call depth, gas tier. Encoder lives in `packages/pattern-matchers/src/embedding.ts` (planned).

Why 192 and not 768 or 1536: Convex's vector index has dimensionality and per-record limits, and we don't need a learned embedding for v1. A hand-rolled feature vector keyed to known transaction shapes is enough for "find similar" queries from the dashboard.

Larger experiments (sentence-embedding the full effect tree) happen offline against checkpointed exports. Results from those experiments may eventually graduate into a v2 encoder, but we keep the production encoder cheap and deterministic.

`modelVersion` is a filter field on the vector index. When the encoder changes we write new rows with the new version, point readers at the new version, and clean up old rows once nothing references them.

## finding

The output. State machine:

```
unverified -> replaying -> verified -> disclosed
                         \  rejected
```

`unverified` candidates are not visible on the dashboard's default view. Reviewers can opt into seeing them when tuning matchers. Only `verified` findings flow into the disclosure pipeline.

`matcherDetail` is `v.any()` on purpose. Each matcher decides what evidence to attach; the schema is enforced by the matcher's TypeScript types and by per-matcher renderers in the dashboard. Forcing a global schema would make adding matchers harder than it needs to be.

## replay_queue

Decoupled from `finding` so the queue can be inspected, drained, and retried independently. The replay worker writes `state` and `claimedBy`; the result lands in `finding.replayResult`.

Three failed attempts and the queue stalls with a paging alert. Repeated failures usually mean a replay-engine bug, not a transient one, and that's worth a human looking.

## ingest_watermark

Single-row table tracking the latest checkpoint we've recorded. Used for:

- The detection driver bounding the live window.
- The bridge spotting gaps on restart.
- The dashboard's health view showing ingest lag.

The `scope: 'global'` field is forward-compatibility. If we ever shard ingest by protocol version or chain epoch, the schema doesn't change.
