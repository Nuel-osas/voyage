import type { CandidateFinding, MatcherContext, PatternMatcher, TxEvent } from '../types.js';

// When an oracle object updates with a new price that creates an arb against
// dependent DEX pools, the first transaction touching both the oracle and a
// dependent pool can capture the spread. We look for: an oracle update, then
// in the same or next checkpoint a transaction touching the same oracle plus
// a DEX pool, with positive net value flow to the trader.
//
// Real arb-following bots do this legitimately. Liquidations triggered by
// oracle updates are a specific subclass that probably shouldn't count as
// adversarial MEV. Replay tells us how much extraction is actually attributable
// to the price change vs. would have happened anyway.

const NOISE_THRESHOLD_MICRO_SUI = 50_000;

export const oracleFrontrun: PatternMatcher = (window, context) => {
  const candidates: CandidateFinding[] = [];

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

  for (const { tx: updateTx, oracleId } of oracleUpdates) {
    const checkpointWindow = [updateTx.checkpoint, updateTx.checkpoint + 1];

    for (const tx of window) {
      if (tx.digest === updateTx.digest) continue;
      if (!checkpointWindow.includes(tx.checkpoint)) continue;
      if (!tx.flags.touchesDex) continue;
      if (!tx.touchedSharedObjects.includes(oracleId)) continue;

      // Trader must come strictly after the update.
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
