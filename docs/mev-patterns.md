# MEV patterns

A pattern earns a slot here when a matcher implementation lands. A pattern leaves only when the lab has formally ruled it out with a documented null result.

## Shared-object sandwich

`packages/pattern-matchers/src/patterns/sharedObjectSandwich.ts`

Sui sequences shared-object access through consensus. A searcher who can predict ordering inside a checkpoint can sandwich a victim swap on a DEX pool. This is the classic EVM MEV pattern; the Sui-specific question is whether ordering predictability after gas is enough to make it worth it.

The matcher looks for three transactions A, B, C in checkpoint order, where A and C share a sender (the searcher), B has a different sender (the victim), all three touch the same DEX pool, and A and C have value deltas with opposite signs (open-then-close). Replay confirms by rerunning the slot without A and C.

False positives we accept and let replay reject: unrelated traders happening to swap the same pool around the same time, market makers running both-sides quoting strategies.

## Oracle-update frontrun

`packages/pattern-matchers/src/patterns/oracleFrontrun.ts`

When an oracle object updates and creates an arb against dependent DEX pools, the first transaction touching both the oracle and a dependent pool can capture the spread. Matcher pairs each oracle-update tx with subsequent transactions in the same or next checkpoint that touch both the oracle and a DEX pool, with positive net value flow.

Real arb-following is legitimate. Liquidations triggered mechanically by oracle updates probably shouldn't count as adversarial. Replay quantifies how much extraction is attributable to the price change versus what would have happened anyway.

## Atomic cross-DEX arbitrage

Spec only. Single-transaction multi-leg PTBs that converge prices across two pools quoting the same pair. This isn't really MEV in the adversarial sense - it's the legitimate mechanism by which prices stay aligned. The matcher's job is characterization: how often, what frequency, what gas-adjusted profitability. If atomic arb is widespread on Sui, that itself is a finding about market microstructure.

## JIT liquidity

Spec only. Searcher observes an incoming swap on a concentrated-liquidity pool, adds liquidity in the relevant tick range immediately before, captures the swap fees, removes immediately after. Three transactions on the same pool with shared sender on the bracketing two. Replay verifies the JIT provider's earned fees exceed gas.

## Shared-object reordering anomaly

Spec only - research-grade. Not a single-transaction MEV shape but a statistical question: across many checkpoints, do certain senders consistently land before others on the same shared objects, beyond what gas-price ordering predicts? If yes, it's evidence of ordering influence even without a specific extraction event.

Output is a flag for human investigation, not a candidate finding.

## Null results

If a matcher runs over weeks of mainnet data and produces zero verified findings, that's a result we publish. The methodology is the same regardless of outcome. The lab's value comes from rigor, not from finding things that may not be there.
