import { internalMutation } from '../_generated/server';
import { v } from 'convex/values';

// Bridge calls this through the HTTP endpoint with each checkpoint batch.
// Idempotency: repushing the same digest at the same ingestVersion is a no-op.
// If the bridge bumps ingestVersion (filter logic changed), we replace existing
// rows instead of inserting duplicates.
//
// We materialize per-object timeline rows on insert. Cheaper to do once here
// than in every matcher.

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
