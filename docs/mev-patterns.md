# MEV Pattern Catalog

Each pattern in this catalog is a hypothesis: a class of MEV that *might* be extractable on Sui mainnet despite the parallel-execution architecture. For each, we document the hypothesis, the detection criteria, and known false-positive sources.

A pattern enters this catalog when a matcher implementation lands. A pattern is removed only when the lab has formally ruled it out (null result documented and replicable).

---

## 1. Shared-Object Sandwich

**Implemented in:** `packages/pattern-matchers/src/patterns/sharedObjectSandwich.ts`
**Status:** active

### Hypothesis

Sui sequences shared-object access through consensus. A searcher who can predict ordering inside a checkpoint can sandwich a victim swap on a DEX pool: lands a frontrun trade, the victim's trade lands at the worse price, the searcher's backrun closes the position at profit.

This is the most common EVM MEV pattern. The Sui-specific question is whether ordering predictability is high enough to make it profitable after gas.

### Detection

Three transactions A, B, C in a small checkpoint window such that:
- All three touch the same DEX pool shared object.
- A and C share a sender (the searcher); B has a different sender (the victim).
- A precedes B precedes C in checkpoint+timestamp order.
- A and C have value deltas with opposite signs on the pool (open-then-close).
- Net delta on the searcher across A and C exceeds the noise threshold.

### False-positive sources

- Two unrelated traders happening to swap the same pool around the same time, where one of them places multiple trades for legitimate reasons.
- Market makers running both-sides quoting strategies.

### Replay verification

The replay-engine reruns the slot omitting A and C, measures the victim's effective price, and compares against the executed price. Sandwich is confirmed only if the difference is positive and exceeds gas paid by the searcher.

---

## 2. Oracle-Update Frontrun

**Implemented in:** `packages/pattern-matchers/src/patterns/oracleFrontrun.ts`
**Status:** active

### Hypothesis

When an oracle object is updated with a price that creates an arbitrage versus pool prices, the first transaction to land touching both the updated oracle and the dependent pool extracts the spread.

### Detection

- A transaction U updates an oracle object O (touches O exclusively, no DEX interaction).
- Within the same checkpoint or the next, a transaction T touches both O and a DEX pool whose pricing depends on O.
- T's net value delta exceeds the noise threshold.
- T is ordered after U.

### False-positive sources

- Aggregators that legitimately consume oracle updates as part of routine routing.
- Liquidations that are mechanically triggered by oracle updates and are not "MEV" in the adversarial sense.

### Replay verification

The replay-engine reruns T against state at the slot before U, measuring how T's outcome would differ without the price update. Confirmation requires the post-update execution to be strictly more profitable than the pre-update execution would have been.

---

## 3. Atomic Cross-DEX Arbitrage *(planned)*

**Status:** spec only

### Hypothesis

Two DEX pools on Sui can quote the same trading pair at different prices for short windows. A single PTB that swaps in one direction on pool A and the opposite direction on pool B closes the spread atomically, capturing the difference.

### Detection criteria

- A single transaction with a multi-leg PTB structure.
- The PTB touches at least two DEX pools matching the same trading pair (resolved via the pool registry).
- Net value delta on the sender is positive after gas.
- Pool prices before and after the transaction reflect convergence.

This pattern is technically not "MEV" in the adversarial sense — it is the legitimate mechanism by which prices stay aligned. The matcher exists to characterize how often it happens, with what frequency, and with what gas-adjusted profitability. If atomic arb is widespread, that itself is a finding about Sui's market microstructure.

---

## 4. JIT Liquidity *(planned)*

**Status:** spec only

### Hypothesis

A searcher observing an incoming swap on a concentrated-liquidity pool adds liquidity in the relevant tick range immediately before the swap, captures the swap fees, then removes liquidity immediately after.

### Detection criteria

- Three transactions A, B, C touching the same pool in order.
- A is a liquidity-add to a tight tick range; B is a swap; C is a liquidity-remove from the same range.
- A and C share a sender; B has a different sender.
- The shared sender's net fee earnings exceed the noise threshold.

### Replay verification

Replay the swap with and without the JIT liquidity in place; confirm that the JIT provider's earned fees are real and exceed gas.

---

## 5. Shared-Object Reordering Anomaly *(planned)*

**Status:** spec only — research-grade

### Hypothesis

If a searcher can influence the ordering of shared-object accesses within a checkpoint (via gas price, validator relationships, or timing), they can extract value across a wider class of transactions than the targeted patterns above. This matcher does not look for a specific MEV shape; it looks for *anomalous* ordering correlations.

Specifically: across many checkpoints, do certain senders consistently land *before* others on the same shared objects, beyond what gas-price ordering predicts? If so, that is itself a research finding even if no single-transaction MEV is extracted.

### Detection criteria

- Statistical test on intra-checkpoint ordering for repeat senders on the same objects, controlling for gas price.
- Anomalous deviation flagged as a candidate for human review rather than as a single MEV instance.

This matcher's "candidate" output is not a finding in the same sense as the others — it is a flag for deeper analysis.

---

## A note on null results

If a matcher runs over weeks of mainnet data and produces zero verified findings, that is a result we document and publish. The methodology is the same regardless of outcome: hypothesis, criteria, replay, conclusion. The lab's value to the ecosystem comes from rigor, not from finding things that may not be there.
