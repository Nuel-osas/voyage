import type { CandidateFinding, MatcherContext, PatternMatcher, TxEvent } from '../types.js';

// Looks for the classic sandwich shape on a shared DEX pool object: searcher
// frontruns a victim swap, victim lands at the worse price, searcher backruns
// to close. Sui sequences shared-object access through consensus, so this is
// theoretically possible if a searcher can predict ordering. Whether it's
// practically extractable after gas is what the replay step tells us.
//
// False positives we accept here and let the replay reject:
//   - Two unrelated traders happening to swap the same pool around the same
//     time, where one places multiple trades for legitimate reasons.
//   - Market makers running both-sides quoting strategies.

const NOISE_THRESHOLD_MICRO_SUI = 10_000;

export const sharedObjectSandwich: PatternMatcher = (window, context) => {
  const candidates: CandidateFinding[] = [];

  // Group DEX-touching transactions by the pool object they hit. Most txs
  // hit zero or one pool, so this is cheap.
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

          // The frontrun and backrun should move the attacker's pool position
          // in opposite directions (open then close).
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

// Coarse profit estimate. Replay produces the real number; this just needs to
// be enough to reject obvious noise.
function sandwichProfitMicroSui(a: TxEvent, c: TxEvent, poolId: string): number {
  const aDelta = attackerDelta(a, poolId);
  const cDelta = attackerDelta(c, poolId);
  return Math.max(0, -(aDelta + cDelta));
}
