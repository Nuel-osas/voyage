import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Schema rationale: docs/data-model.md.

export default defineSchema({
  // Filtered transactions from mainnet. Bridge writes, matchers read.
  tx_event: defineTable({
    digest: v.string(),
    checkpoint: v.number(),
    timestampMs: v.number(),
    sender: v.string(),
    touchedSharedObjects: v.array(v.string()),
    valueDelta: v.array(
      v.object({
        objectId: v.string(),
        objectType: v.string(),
        deltaMicroSui: v.number(),
      })
    ),
    flags: v.object({
      touchesDex: v.boolean(),
      touchesOracle: v.boolean(),
      touchesLending: v.boolean(),
      isMultiHop: v.boolean(),
    }),
    gasUsed: v.number(),
    // Bumped when bridge filter logic changes. Lets us replace stale rows
    // without a full re-ingest.
    ingestVersion: v.number(),
  })
    .index('by_checkpoint', ['checkpoint'])
    .index('by_sender', ['sender'])
    .index('by_digest', ['digest']),

  // Per-object access timeline. Materialized on insert so matchers don't
  // scan tx_event by checkpoint range to answer "what touched object X".
  object_timeline: defineTable({
    objectId: v.string(),
    checkpoint: v.number(),
    txDigest: v.string(),
    sender: v.string(),
    deltaMicroSui: v.number(),
  }).index('by_object_checkpoint', ['objectId', 'checkpoint']),

  // 192-dim shape embeddings, used for "find similar transactions" in the
  // dashboard. Encoder lives in pattern-matchers/src/embedding.ts.
  tx_embeddings: defineTable({
    txDigest: v.string(),
    checkpoint: v.number(),
    embedding: v.array(v.float64()),
    modelVersion: v.string(),
  })
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 192,
      filterFields: ['modelVersion'],
    })
    .index('by_digest', ['txDigest']),

  // unverified -> replaying -> verified | rejected -> disclosed
  finding: defineTable({
    pattern: v.string(),
    severity: v.optional(v.number()),
    state: v.union(
      v.literal('unverified'),
      v.literal('replaying'),
      v.literal('verified'),
      v.literal('rejected'),
      v.literal('disclosed')
    ),
    checkpoint: v.number(),
    relatedTxDigests: v.array(v.string()),
    matcherDetail: v.any(),
    replayResult: v.optional(
      v.object({
        confirmed: v.boolean(),
        extractedMicroSui: v.number(),
        replayedAtMs: v.number(),
      })
    ),
    assignedReviewer: v.optional(v.string()),
    disclosureState: v.optional(
      v.union(
        v.literal('private'),
        v.literal('drafted'),
        v.literal('sent'),
        v.literal('public')
      )
    ),
  })
    .index('by_state', ['state'])
    .index('by_pattern', ['pattern'])
    .index('by_checkpoint', ['checkpoint']),

  // Replay job queue. Decoupled from `finding` so it can be drained, retried,
  // and inspected on its own.
  replay_queue: defineTable({
    findingId: v.id('finding'),
    enqueuedAtMs: v.number(),
    claimedBy: v.optional(v.string()),
    claimedAtMs: v.optional(v.number()),
    attempts: v.number(),
    state: v.union(
      v.literal('pending'),
      v.literal('claimed'),
      v.literal('completed'),
      v.literal('failed')
    ),
  }).index('by_state', ['state']),

  // Single-row table tracking the latest checkpoint we've recorded.
  ingest_watermark: defineTable({
    scope: v.string(),
    latestCheckpoint: v.number(),
    updatedAtMs: v.number(),
  }).index('by_scope', ['scope']),
});
