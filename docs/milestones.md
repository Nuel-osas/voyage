# Milestones

Six weeks. Each milestone produces something runnable, not paper plans.

## Week 1: thin slice

One transaction flows from Sui mainnet into Convex, through one matcher, into a finding row, into the dashboard.

Bridge subscribes to checkpoints and posts filtered batches. Convex `recordCheckpoint` writes rows and advances the watermark. `sharedObjectSandwich` runs against a static fixture in tests and against live windows in the action. Dashboard lists findings, no styling yet.

Done when a live mainnet checkpoint produces a candidate (real or synthetic) visible in the dashboard within 60 seconds.

## Week 2: replay verification

Replay-engine confirms or rejects candidates. Loads state at the slot before, replays canonical and adversarial orders, computes extracted value. Convex enqueues, replay claims, writes result back. Finding state machine works end-to-end.

Done when a verified finding appears in the dashboard with a non-zero confirmed extraction backed by a replay diff a reviewer can inspect.

## Week 3: pattern coverage and embeddings

`oracleFrontrun` ships. `atomicCrossDexArbitrage` ships. Embedding encoder writes 192-dim shape vectors. Dashboard gets a "similar transactions" panel.

Done when opening a finding shows the 10 most similar historical transactions with confidence scores.

## Week 4: backfill

Bridge gains a backfill mode, idempotent against `tx_event.digest`. Run a 30-day backfill over historical mainnet. Schedule a full-window rematch.

Done when we have a stable count of findings across 30 days with a documented baseline.

## Week 5: disclosure pipeline

Disclosure state transitions, reviewer assignments, draft templates, recipient management. Notification path to the Sui Foundation defined and tested with a synthetic finding.

Done when a real or synthetic finding moves through `private -> drafted -> sent` with a complete audit trail.

## Week 6: public artifact

Methodology page on the dashboard. Open-source release of pattern-matchers under Apache-2.0. Paper draft regardless of outcome.

Done when an outside researcher could clone the repo and reproduce the rolling 30-day scan against their own Convex deployment.
