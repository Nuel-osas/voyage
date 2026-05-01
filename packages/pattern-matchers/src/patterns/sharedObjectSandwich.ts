import type { CandidateFinding, MatcherContext, PatternMatcher, TxEvent } from '../types.js';

/**
 * Shared-Object Sandwich matcher.
 *
 * Hypothesis: an attacker observes a target swap landing in a checkpoint, lands
 * a frontrun transaction touching the same DEX pool object earlier in the same
 * checkpoint (or one checkpoint earlier), then lands a backrun closing the
 * position immediately after.
 *
 * Sui's parallel execution still sequences shared-object access through
 * consensus. If a searcher can predict ordering, sandwich-shaped MEV is
 * theoretically possible.
 *
 * Detection criteria:
 *   1. Three transactions A, B, C such that:
 *      - All three touch the same DEX pool shared object.
 *      - A and C have the same sender (the attacker).
 *      - B has a different sender (the victim).
 *      - A precedes B precedes C in checkpoint+intra-checkpoint order.
 *      - A and C have value deltas that approximately reverse each other.
 *      - Net A+C value delta on the attacker is positive.
 *
 *   2. The attacker's net positive delta exceeds a noise threshold.
 *
 * False-positive sources:
 *   - Two unrelated traders happen to swap on the same pool around the same time.
 *   - Market-making strategies that legitimately quote both sides of a pool.
 *
 * The replay-engine resolves ambiguity by re-running the slot with and without
 * the inserted A and C transactions and confirming whether the attacker's
 * extraction is real.
 */

const NOISE_THRESHOLD_MICRO_SUI = 10_000; // 0.01 SUI; below this is too noisy to investigate

export const sharedObjectSandwich: PatternMatcher = (window, context) => {
  const candidates: CandidateFinding[] = [];

  // Index transactions by pool object touched. Most txs touch zero or one DEX pool.
  const byPool = new Map<string, TxEvent[]>();
  for (const tx of window) {
    if (!tx.flags.touchesDex) continue;
    for (const objId of tx.touchedSharedObjects) {
      if (!context.dexPoolRegistry.has(objId)) continue;
      let bucket = byPool.get(objId);
      if (!bucket) {
        bucket = [];
        byPool.set(objId, bucket);
      }
      bucket.push(tx);
    }
  }

  for (const [poolId, txs] of byPool) {
    if (txs.length < 3) continue;
    txs.sort(byOrder);

    // For each potential frontrun A, look for a victim B and a backrun C.
    for (let i = 0; i < txs.length - 2; i++) {
      const a = txs[i];
      for (let j = i + 1; j < txs.length - 1; j++) {
        const b = txs[j];
        if (b.sender === a.sender) continue;

        for (let k = j + 1; k < txs.length; k++) {
          const c = txs[k];
          if (c.sender !== a.sender) continue;

          const profit = sandwichProfitMicroSui(a, c, poolId);
          if (profit < NOISE_THRESHOLD_MICRO_SUI) continue;

          // Approximate reversal check: the position A opened must be roughly
          // the position C closed. We check this by sign-of-delta on the
          // attacker's value movement on this pool.
          const aDelta = attackerDelta(a, poolId);
          const cDelta = attackerDelta(c, poolId);
          if (Math.sign(aDelta) === Math.sign(cDelta)) continue;

          candidates.push({
            pattern: 'shared-object-sandwich',
            relatedTxDigests: [a.digest, b.digest, c.digest],
            checkpoint: b.checkpoint,
            estimatedExtractionMicroSui: profit,
            detail: {
              poolId,
              attacker: a.sender,
              victim: b.sender,
              frontrunDigest: a.digest,
              victimDigest: b.digest,
              backrunDigest: c.digest,
              checkpointSpan: c.checkpoint - a.checkpoint,
            },
          });

          // A given (a, c) pair only produces one candidate — break once matched
          break;
        }
      }
    }
  }

  return candidates;
};

function byOrder(x: TxEvent, y: TxEvent): number {
  if (x.checkpoint !== y.checkpoint) return x.checkpoint - y.checkpoint;
  return x.timestampMs - y.timestampMs;
}

function attackerDelta(tx: TxEvent, poolId: string): number {
  let net = 0;
  for (const d of tx.valueDelta) {
    if (d.objectId === poolId) net += d.deltaMicroSui;
  }
  return net;
}

/**
 * Crude profit estimate. The replay-engine produces the authoritative number;
 * this only needs to be good enough to reject noise candidates.
 */
function sandwichProfitMicroSui(a: TxEvent, c: TxEvent, poolId: string): number {
  // Sum of attacker-side value deltas on the pool, ignoring gas (replay accounts for gas).
  const aDelta = attackerDelta(a, poolId);
  const cDelta = attackerDelta(c, poolId);
  return Math.max(0, -(aDelta + cDelta));
}
