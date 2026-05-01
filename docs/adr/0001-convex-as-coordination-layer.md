# ADR 0001: Convex for coordination, not ingest

## What we're picking

Convex as the system of record for transaction graph, embeddings, findings, and review state. A separate Rust worker handles ingest from Sui mainnet and pushes filtered data to Convex over HTTP.

## What we considered

Postgres for storage, Redis for streaming, pgvector for similarity, a cron worker for schedules, a websocket layer for the dashboard. All real options. All also five services to deploy and glue together.

## Why Convex

Five reactive consumers, one type system, no glue code between them. The dashboard, the scheduled rematching, replay completion notifications, reviewer assignments, and disclosure transitions all read from the same place and update without me writing pub/sub.

The Convex deployment also becomes a public artifact for "what reactive backends look like at research scale." That has its own value if we ever talk about the work.

## Why ingest is a separate Rust worker

Sui peaks around 7K TPS. Convex is the wrong place to do high-throughput filtering. Pushing every transaction in would burn function-time on cheap rejections.

Filtering belongs at the source: walk the checkpoint, drop irrelevant transactions, send a smaller batch over HTTP with a shared-secret header. The bridge keeps Convex's role clean (it stores what's relevant) and lets the bridge evolve independently.

## What this costs us

Cross-table analytics is awkward. Convex queries aren't SQL, so "give me every finding whose touched objects appear in another finding" is a denormalization problem. Dealt with by materializing per-object timelines on insert.

Vector index has dimensionality and per-record limits. Compact embeddings (192-dim, transaction-shape only) work inside those limits. Larger experiments happen offline against exports.

## Revisit when

- 30-day Convex bill exceeds the budget envelope.
- Dashboard p95 query latency goes above 800ms.
- A new pattern matcher needs an analytic shape that materialization can't serve.
