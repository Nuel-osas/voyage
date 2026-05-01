import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Schema for the Sui MEV Discovery Lab.
 *
 * Design notes:
 * - Every table has explicit indexes; no full-table scans on the hot path.
 * - Filtered ingest means tx_event is already small relative to mainnet volume;
 *   the rolling window for live detection is governed by checkpoint sequence number,
 *   not by row count.
 * - Embeddings are kept compact (192-dim) to stay within Convex vector index limits
 *   while still capturing transaction shape (touched object types, value flow shape,
 *   call depth).
 */
export default defineSchema({
  /**
   * Filtered transaction events from Sui mainnet.
   * Populated only by the ingest-bridge HTTP endpoint.
   */
  tx_event: defineTable({
    digest: v.string(),
    checkpoint: v.number(),
    timestampMs: v.number(),
    sender: v.string(),

    // The set of shared objects this transaction mutated.
    // Stored as sorted array of object IDs for deterministic comparison.
    touchedSharedObjects: v.array(v.string()),

    // Effects — only the value-bearing portion. Full effects are referenced by digest.
    valueDelta: v.array(
      v.object({
        objectId: v.string(),
        objectType: v.string(),
        deltaMicroSui: v.number(),
      })
    ),

    // Whether this transaction interacted with a known DEX or oracle.
    // Surfaced as flags for fast filtering by matchers.
    flags: v.object({
      touchesDex: v.boolean(),
      touchesOracle: v.boolean(),
      touchesLending: v.boolean(),
      isMultiHop: v.boolean(),
    }),

    // Gas used. Useful for several matchers (JIT signature, sandwich heuristic).
    gasUsed: v.number(),

    // Idempotency: ingest-bridge sets this. Re-pushing the same digest is a no-op.
    ingestVersion: v.number(),
  })
    .index('by_checkpoint', ['checkpoint'])
    .index('by_sender', ['sender'])
    .index('by_digest', ['digest']),

  /**
   * Per-object access timeline.
   * Materialized view, populated by the recordCheckpoint mutation as a side effect.
   * Lets matchers efficiently ask "what touched object X in the last N checkpoints?"
   * without scanning tx_event by checkpoint range and filtering.
   */
  object_timeline: defineTable({
    objectId: v.string(),
    checkpoint: v.number(),
    txDigest: v.string(),
    sender: v.string(),
    deltaMicroSui: v.number(),
  })
    .index('by_object_checkpoint', ['objectId', 'checkpoint']),

  /**
   * Compact embeddings of transaction shape for similarity search against
   * known MEV signatures and against each other.
   *
   * Vector index keeps the dashboard "find similar transactions" view
   * sub-second.
   */
  tx_embeddings: defineTable({
    txDigest: v.string(),
    checkpoint: v.number(),
    embedding: v.array(v.float64()),
    // Embedding model version — bumped when the feature extractor changes.
    // Old embeddings are kept until rematched.
    modelVersion: v.string(),
  })
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 192,
      filterFields: ['modelVersion'],
    })
    .index('by_digest', ['txDigest']),

  /**
   * Candidate findings produced by pattern matchers.
   * A finding is "unverified" until the replay-engine writes back a confirmed
   * extraction. Only verified findings reach the public reviewer dashboard.
   */
  finding: defineTable({
    pattern: v.string(), // matcher name e.g. 'shared-object-sandwich'
    severity: v.optional(v.number()), // computed after replay confirms extraction
    state: v.union(
      v.literal('unverified'),
      v.literal('replaying'),
      v.literal('verified'),
      v.literal('rejected'),
      v.literal('disclosed')
    ),
    checkpoint: v.number(),
    relatedTxDigests: v.array(v.string()),
    // Free-form per-matcher detail. Schema enforced by the matcher itself.
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

  /**
   * Replay job queue.
   * The Rust replay-engine subscribes to this table to pick up work.
   * Decoupled from `finding` so the queue can be inspected, retried, and drained
   * independently.
   */
  replay_queue: defineTable({
    findingId: v.id('finding'),
    enqueuedAtMs: v.number(),
    claimedBy: v.optional(v.string()), // worker id when claimed
    claimedAtMs: v.optional(v.number()),
    attempts: v.number(),
    state: v.union(
      v.literal('pending'),
      v.literal('claimed'),
      v.literal('completed'),
      v.literal('failed')
    ),
  })
    .index('by_state', ['state']),

  /**
   * Per-checkpoint ingest watermark.
   * Single-row table (id always 'global') tracking the latest checkpoint successfully
   * recorded. Drives backfill and detects ingest-bridge gaps.
   */
  ingest_watermark: defineTable({
    scope: v.string(), // always 'global' for v1
    latestCheckpoint: v.number(),
    updatedAtMs: v.number(),
  }).index('by_scope', ['scope']),
});
