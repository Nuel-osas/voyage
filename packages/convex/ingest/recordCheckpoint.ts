import { internalMutation } from '../_generated/server';
import { v } from 'convex/values';

/**
 * Ingest mutation called by the ingest-bridge HTTP endpoint.
 *
 * Idempotency: re-pushing a checkpoint with the same `ingestVersion` is a
 * no-op. The bridge bumps `ingestVersion` only when the filter logic itself
 * changes — not on retries. This guarantees that retries from the bridge
 * never cause duplicate writes.
 *
 * Materialization: every accepted tx_event also writes per-object timeline
 * rows synchronously. Doing this on insert is cheaper than reconstructing
 * the timeline on every matcher run.
 *
 * See ADR 0001 for why ingest is the bridge's responsibility, not Convex's.
 */

export const recordCheckpoint = internalMutation({
  args: {
    checkpoint: v.number(),
    transactions: v.array(
      v.object({
        digest: v.string(),
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
      })
    ),
    ingestVersion: v.number(),
  },
  handler: async (ctx, args) => {
    let recorded = 0;
    let skipped = 0;

    for (const tx of args.transactions) {
      const existing = await ctx.db
        .query('tx_event')
        .withIndex('by_digest', (q) => q.eq('digest', tx.digest))
        .first();

      if (existing) {
        if (existing.ingestVersion >= args.ingestVersion) {
          skipped++;
          continue;
        }
        // Bridge filter logic was updated. Replace the old row.
        await ctx.db.patch(existing._id, {
          touchedSharedObjects: tx.touchedSharedObjects,
          valueDelta: tx.valueDelta,
          flags: tx.flags,
          gasUsed: tx.gasUsed,
          ingestVersion: args.ingestVersion,
        });
        recorded++;
        continue;
      }

      await ctx.db.insert('tx_event', {
        digest: tx.digest,
        checkpoint: args.checkpoint,
        timestampMs: tx.timestampMs,
        sender: tx.sender,
        touchedSharedObjects: tx.touchedSharedObjects,
        valueDelta: tx.valueDelta,
        flags: tx.flags,
        gasUsed: tx.gasUsed,
        ingestVersion: args.ingestVersion,
      });

      // Materialize per-object timeline rows.
      for (const obj of tx.touchedSharedObjects) {
        const objDelta = tx.valueDelta.find((d) => d.objectId === obj);
        await ctx.db.insert('object_timeline', {
          objectId: obj,
          checkpoint: args.checkpoint,
          txDigest: tx.digest,
          sender: tx.sender,
          deltaMicroSui: objDelta?.deltaMicroSui ?? 0,
        });
      }

      recorded++;
    }

    // Advance the watermark. Used by detection driver to bound the live window.
    const watermark = await ctx.db
      .query('ingest_watermark')
      .withIndex('by_scope', (q) => q.eq('scope', 'global'))
      .first();
    if (!watermark || watermark.latestCheckpoint < args.checkpoint) {
      if (watermark) {
        await ctx.db.patch(watermark._id, {
          latestCheckpoint: args.checkpoint,
          updatedAtMs: Date.now(),
        });
      } else {
        await ctx.db.insert('ingest_watermark', {
          scope: 'global',
          latestCheckpoint: args.checkpoint,
          updatedAtMs: Date.now(),
        });
      }
    }

    return { recorded, skipped, checkpoint: args.checkpoint };
  },
});
