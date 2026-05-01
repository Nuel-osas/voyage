# Milestones

A 6-week plan. Each milestone produces a runnable artifact, not a paper plan.

## Week 1 — End-to-end thin slice

**Goal:** one transaction flows from Sui mainnet into Convex, through one matcher, into a finding row, into the dashboard.

- ingest-bridge: Sui checkpoint subscription, naive filter, HTTP push.
- Convex: `tx_event` insert, `recordCheckpoint` mutation, watermark advancement.
- pattern-matchers: `sharedObjectSandwich` runs against a static fixture in tests.
- Convex action: invokes matcher over rolling window, persists candidates, enqueues replays.
- dashboard: single page listing findings, subscribes to Convex, no styling.

Acceptance: live mainnet checkpoint produces a candidate (real or synthetic) visible in the dashboard within 60 seconds.

## Week 2 — Replay verification

**Goal:** the replay-engine confirms or rejects candidates against forked state.

- replay-engine: Rust binary that loads Sui state at slot, replays transactions in canonical and adversarial orders, returns extracted value estimate.
- Convex: replay-engine subscribes to `replay_queue`, claims jobs atomically, writes results.
- finding state machine works end to end: unverified → replaying → verified/rejected.
- dashboard: shows replay status and confirmed extraction values.

Acceptance: a verified finding appears in the dashboard with a non-zero confirmed extraction value, supported by a replay diff that a reviewer can inspect.

## Week 3 — Pattern coverage and embeddings

**Goal:** all v1 matchers shipped; embeddings power similarity search.

- `oracleFrontrun` ships.
- `atomicCrossDexArbitrage` ships.
- Embedding encoder: 192-dim transaction-shape vectors stored in `tx_embeddings`.
- Convex query: "find transactions similar to this one" backed by vector index.
- dashboard: per-finding similar-transactions panel.

Acceptance: opening a finding shows the 10 most similar historical transactions, with confidence scores.

## Week 4 — Backfill and rolling analysis

**Goal:** ingest 30 days of historical mainnet data; first systematic scan completes.

- ingest-bridge: backfill mode, idempotent against `tx_event.digest`.
- Convex: scheduled rematching of the full 30-day window with current matcher set.
- dashboard: histogram of findings by pattern, by day, by extraction range.

Acceptance: a stable count of findings across 30 days, with a documented statistical baseline.

## Week 5 — Disclosure pipeline and curation

**Goal:** verified findings flow into a coordinated disclosure workflow.

- Convex: `finding.disclosureState` transitions, reviewer assignments, drafted disclosures stored.
- dashboard: per-finding disclosure UI, draft template, recipient management.
- Notification path to Sui Foundation defined and tested with a synthetic finding.

Acceptance: a real (or synthetic) finding moves through `private → drafted → sent` with a complete audit trail.

## Week 6 — Public artifact

**Goal:** the lab's first public output ships.

- Methodology page on the dashboard explaining what the lab does and what it does not claim.
- Open-source release of pattern-matchers and the methodology document under Apache-2.0.
- Paper draft (regardless of outcome): findings, methodology, replay corpus, null-result analysis where applicable.

Acceptance: external researcher could clone the repo and reproduce the rolling 30-day scan against their own Convex deployment.
