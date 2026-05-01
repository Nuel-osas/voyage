import { internalAction, internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { v } from 'convex/values';
import { ALL_MATCHERS, type TxEvent, type MatcherContext } from '@sui-mev-lab/pattern-matchers';
import { loadMatcherContext } from '../internal/matcherContext';

/**
 * Driver for pattern detection.
 *
 * Runs on a scheduled cadence (every 30s) over a rolling window of recent
 * checkpoints. Loads the window, calls every matcher, persists candidate
 * findings, and enqueues replays.
 *
 * Matchers themselves are pure functions in the @sui-mev-lab/pattern-matchers
 * package. This action is the only place that knows about Convex storage.
 *
 * See ADR 0004 for why detection logic does not live in Convex.
 */

const WINDOW_CHECKPOINTS = 60; // ~5 minutes at typical Sui cadence

export const runMatchers = internalAction({
  args: {},
  handler: async (ctx) => {
    const watermark = await ctx.runQuery(internal.internal.watermark.latest);
    if (!watermark) return { reason: 'no-watermark' };

    const minCheckpoint = Math.max(0, watermark.latestCheckpoint - WINDOW_CHECKPOINTS);
    const window = await ctx.runQuery(internal.internal.txEvents.windowSince, {
      minCheckpoint,
    });

    if (window.length === 0) return { reason: 'empty-window', minCheckpoint };

    const matcherContext: MatcherContext = await loadMatcherContext(ctx);

    let totalCandidates = 0;
    for (const { name, matcher } of ALL_MATCHERS) {
      const candidates = matcher(window as TxEvent[], matcherContext);
      if (candidates.length === 0) continue;

      await ctx.runMutation(internal.detection.runMatchers.persistCandidates, {
        matcher: name,
        candidates: candidates.map((c) => ({
          pattern: c.pattern,
          relatedTxDigests: c.relatedTxDigests,
          checkpoint: c.checkpoint,
          estimatedExtractionMicroSui: c.estimatedExtractionMicroSui,
          detail: c.detail,
        })),
      });
      totalCandidates += candidates.length;
    }

    return {
      windowSize: window.length,
      candidateCount: totalCandidates,
      minCheckpoint,
      maxCheckpoint: watermark.latestCheckpoint,
    };
  },
});

/**
 * Idempotent persistence for candidate findings.
 *
 * We dedupe on (pattern, relatedTxDigests sorted). Re-running a matcher over
 * an overlapping window does not create duplicate findings.
 */
export const persistCandidates = internalMutation({
  args: {
    matcher: v.string(),
    candidates: v.array(
      v.object({
        pattern: v.string(),
        relatedTxDigests: v.array(v.string()),
        checkpoint: v.number(),
        estimatedExtractionMicroSui: v.number(),
        detail: v.any(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    for (const c of args.candidates) {
      const sortedDigests = [...c.relatedTxDigests].sort();
      const dedupKey = `${c.pattern}|${sortedDigests.join(',')}`;

      const existing = await ctx.db
        .query('finding')
        .withIndex('by_pattern', (q) => q.eq('pattern', c.pattern))
        .filter((q) => q.eq(q.field('checkpoint'), c.checkpoint))
        .collect();

      const isDuplicate = existing.some((f) => {
        const fSorted = [...f.relatedTxDigests].sort();
        return fSorted.join(',') === sortedDigests.join(',');
      });
      if (isDuplicate) continue;

      const findingId = await ctx.db.insert('finding', {
        pattern: c.pattern,
        state: 'unverified',
        checkpoint: c.checkpoint,
        relatedTxDigests: c.relatedTxDigests,
        matcherDetail: {
          ...c.detail,
          dedupKey,
          estimatedExtractionMicroSui: c.estimatedExtractionMicroSui,
        },
        disclosureState: 'private',
      });

      await ctx.db.insert('replay_queue', {
        findingId,
        enqueuedAtMs: Date.now(),
        attempts: 0,
        state: 'pending',
      });
      inserted++;
    }
    return { inserted };
  },
});
