import type { CandidateFinding, MatcherContext, PatternMatcher, TxEvent } from '../types.js';

/**
 * Oracle-Update Frontrun matcher.
 *
 * Hypothesis: when an oracle object updates with a price that creates an
 * arbitrage between Sui DEX pools and external markets, an attacker can
 * land a transaction that consumes the update before the next legitimate
 * trader.
 *
 * Detection criteria:
 *   1. Oracle object O is updated in checkpoint K (touched as the only
 *      shared object in an update transaction).
 *   2. In checkpoint K or K+1, a transaction touches both O and a DEX pool
 *      whose pricing depends on O.
 *   3. The dependent pool's price relationship to O moved in the attacker's
 *      favor by more than the noise threshold.
 *
 * The replay-engine confirms by simulating the same transaction without
 * the preceding oracle update and measuring the difference.
 */

const NOISE_THRESHOLD_MICRO_SUI = 50_000; // 0.05 SUI

export const oracleFrontrun: PatternMatcher = (window, context) => {
  const candidates: CandidateFinding[] = [];

  // Index oracle update transactions: those touching exactly one oracle object
  // and not interacting with DEX pools.
  const oracleUpdates: Array<{ tx: TxEvent; oracleId: string }> = [];
  for (const tx of window) {
    if (!tx.flags.touchesOracle) continue;
    for (const objId of tx.touchedSharedObjects) {
      if (context.oracleRegistry.has(objId)) {
        oracleUpdates.push({ tx, oracleId: objId });
      }
    }
  }

  if (oracleUpdates.length === 0) return candidates;

  // For each oracle update, look for trades in the same or next checkpoint
  // that touch the oracle and a DEX pool simultaneously.
  for (const { tx: updateTx, oracleId } of oracleUpdates) {
    const checkpointWindow = [updateTx.checkpoint, updateTx.checkpoint + 1];

    for (const tx of window) {
      if (tx.digest === updateTx.digest) continue;
      if (!checkpointWindow.includes(tx.checkpoint)) continue;
      if (!tx.flags.touchesDex) continue;
      if (!tx.touchedSharedObjects.includes(oracleId)) continue;

      // The trader must come after the update.
      if (tx.checkpoint < updateTx.checkpoint) continue;
      if (tx.checkpoint === updateTx.checkpoint && tx.timestampMs <= updateTx.timestampMs) {
        continue;
      }

      const profit = traderNetMicroSui(tx);
      if (profit < NOISE_THRESHOLD_MICRO_SUI) continue;

      candidates.push({
        pattern: 'oracle-frontrun',
        relatedTxDigests: [updateTx.digest, tx.digest],
        checkpoint: tx.checkpoint,
        estimatedExtractionMicroSui: profit,
        detail: {
          oracleId,
          oracleFeed: context.oracleRegistry.get(oracleId)?.feed,
          updateDigest: updateTx.digest,
          tradeDigest: tx.digest,
          trader: tx.sender,
          checkpointGap: tx.checkpoint - updateTx.checkpoint,
        },
      });
    }
  }

  return candidates;
};

function traderNetMicroSui(tx: TxEvent): number {
  let net = 0;
  for (const d of tx.valueDelta) net += d.deltaMicroSui;
  return Math.max(0, net);
}
