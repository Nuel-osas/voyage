# ADR 0001: Convex as Coordination Layer, Not Ingest Path

**Status:** Accepted
**Context owner:** Architecture
**Decision drivers:** throughput, cost, single-engineer maintainability

## Context

The Sui MEV Discovery Lab needs a system of record for the transaction graph, embeddings, candidate findings, and review state. It also needs reactive update propagation across at least five consumers (dashboard, reviewer notifications, replay completion, disclosure state, scheduled rematching).

Two stack shapes were considered:

1. **Traditional:** Postgres + Redis + pgvector + cron worker + WebSocket server, glued together with application code.
2. **Convex-centered:** one reactive backend that owns all of the above with a shared type system.

Sui mainnet produces transactions at peak rates around 7,000 TPS. Pushing all of them through any system of record is wasteful — most are not relevant to MEV detection.

## Decision

We adopt a Convex-centered design with a Rust ingest worker at the boundary.

- Convex is the system of record for the transaction graph, embeddings, findings, and review state.
- Convex executes scheduled pattern detection over rolling windows.
- Convex owns the reactive query layer for the dashboard.
- A Rust `ingest-bridge` worker filters Sui's checkpoint stream and pushes only relevant transactions to Convex over HTTP.

## Consequences

### Positive

- Five reactive consumers cost zero additional code.
- Schema and detection logic share a TypeScript type system; no codegen step.
- One service to deploy, monitor, and pay for.
- Convex's own usage as a research-grade backend is itself a public artifact.

### Negative

- We pay for the architectural boundary at the edge: a separate Rust service and the protocol between it and Convex.
- Cross-table analytics (e.g. "show me all findings whose touched objects also appear in another finding") require either denormalization or post-processing — Convex queries are not SQL.
- Vector search has dimensionality and per-record size constraints, which forced a compact transaction-shape embedding rather than a fuller representation.

### Mitigations

- Define the HTTP boundary with idempotency keys and explicit schema versioning so the bridge can evolve independently.
- Materialize per-object timelines on insert so reviewer queries hit indexed projections.
- Run the larger embedding experiments in an offline notebook against checkpointed Convex exports, not in the hot path.

## Status Notes

Revisited: not yet. Threshold for revisiting: a sustained 30-day Convex bill exceeding the budget envelope, or a query latency on the dashboard exceeding 800ms p95.
