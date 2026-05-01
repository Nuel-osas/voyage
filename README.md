# Sui MEV Discovery Lab

**A research-grade scanner for extractable value patterns on Sui mainnet.**

Sui claims its parallel-execution architecture eliminates traditional MEV. This project rigorously tests that claim.

The lab ingests Sui mainnet shared-object access patterns into a reactive backend, runs pattern detection against known MEV signatures from EVM/Solana, replays candidates against forked Sui state to confirm extractable value, and surfaces findings through a coordinated-disclosure pipeline.

Both outcomes are valuable: a CVE-class finding, or a formal benchmark of Sui's MEV-resistance claim.

---

## Architecture at a Glance

```
                ┌──────────────────────────────────────────────┐
                │              Sui mainnet RPC + Indexer        │
                └───────────────────────┬──────────────────────┘
                                        │ checkpoint subscription
                                        ▼
                        ┌──────────────────────────┐
                        │   ingest-bridge (Rust)    │
                        │  filters shared-obj only  │  
                        └───────────┬──────────────┘
                                    │ batched HTTP push
                                    ▼
        ┌────────────────────────────────────────────────────────┐
        │                    Convex Backend                       │
        │  ┌───────────────┐  ┌──────────────┐  ┌────────────┐  │
        │  │ tx graph + obj │  │  embeddings  │  │  findings  │  │
        │  │   timeline DB  │  │ (vector idx) │  │   review   │  │
        │  └───────────────┘  └──────────────┘  └────────────┘  │
        │  ┌─────────────────────────────────────────────────┐  │
        │  │  scheduled actions: pattern matchers + replays  │  │
        │  └─────────────────────────────────────────────────┘  │
        └────────────────────────┬───────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
   ┌──────────────────┐  ┌────────────────┐  ┌──────────────┐
   │ replay-engine    │  │ pattern-       │  │  dashboard   │
   │ (Rust, forked    │  │ matchers (TS)  │  │  (Next.js)   │
   │ state replay)    │  │                │  │  reactive UI │
   └──────────────────┘  └────────────────┘  └──────────────┘
```

This split is deliberate. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) and the ADRs in [`docs/adr/`](./docs/adr/) for the reasoning.

---

## Repository Layout

This is a pnpm workspaces monorepo. Each package has a single responsibility and a stable boundary.

```
sui-mev-lab/
├── docs/
│   ├── adr/                    # Architecture Decision Records (numbered, dated, immutable once accepted)
│   ├── data-model.md           # Convex schema rationale
│   └── mev-patterns.md         # Catalog of MEV patterns the lab hunts
├── packages/
│   ├── convex/                 # Convex backend — single source of truth for shared state
│   ├── ingest-bridge/          # Rust worker: Sui RPC → filtered events → Convex HTTP endpoints
│   ├── replay-engine/          # Rust: deterministic forked-state replay for candidate verification
│   ├── pattern-matchers/       # TypeScript pattern detection logic (shared between Convex actions + offline backfill)
│   └── dashboard/              # Next.js reactive UI for findings review and disclosure workflow
├── scripts/                    # Operational tooling (bootstrap, replay-batch, dry-run)
├── ARCHITECTURE.md             # Top-level design doc
└── README.md                   # This file
```

---

## Why This Stack

The architecture is opinionated about where each technology sits. The constraint that drove every decision: **a single engineer must be able to ship the full system in 6 weeks, then maintain it indefinitely.**

### Convex — the reactive coordination layer
Convex owns the system of record for the transaction graph, embeddings, findings, and review state. It collapses what would otherwise be Postgres + Redis + a vector index + a cron worker + a WebSocket server into one type-safe surface. Every part of the system that needs reactive updates (dashboard, reviewer notifications, scheduled rescans) reads from Convex.

### Rust — the high-throughput edges
Convex is not a streaming ingest engine, and that is correct. The `ingest-bridge` is a Rust worker that subscribes to Sui checkpoints, applies aggressive filtering (shared-object mutations only), and pushes batched payloads to Convex over HTTP. This keeps Convex out of the hot path for raw mainnet throughput while preserving its role as the authoritative store. The `replay-engine` is also Rust because deterministic forked-state replay against the real Sui execution layer requires the canonical Move VM bindings.

### Next.js — the review surface
The dashboard does not own state. It subscribes to Convex queries and renders. Reviewers triage candidate findings, mark severity, and drive the disclosure workflow. Server-side rendering only for SEO on the public methodology pages — everything operational is client-side reactive.

---

## Where Convex's Boundaries Become Architecture

Convex is the right hub for this system, but it has shape, and that shape drove specific decisions:

- **Sui produces ~7K TPS at peak.** Pushing every transaction into Convex would exceed reasonable cost envelopes and write rates. The `ingest-bridge` filters at source — only shared-object mutations and DEX-touching transactions cross the boundary. This typically reduces volume by 60-90%.
- **Forked-state replay can take 30+ seconds per candidate.** Convex actions support long-running work but cost-per-second is real. We push replays to a Rust worker pool; Convex schedules and observes, but does not execute.
- **Convex query language is not SQL.** Cross-table analytics over historical data is an awkward fit. We materialize daily roll-ups into purpose-built tables for the kinds of queries the reviewer UI needs, rather than trying to express ad-hoc analytics at query time.
- **Vector search has size and dimensionality limits.** Embeddings are kept compact (192-dim, transaction-shape only — not full blob embeddings). Larger experiments (full PTB embeddings) are explored offline.

These are not workarounds. They are the architecture: Convex owns coordination, Rust owns throughput, and the boundary is where each is strongest.

---

## Status

This repository is scaffolded and architecturally documented. Implementation milestones are tracked in `docs/milestones.md`. The first runnable end-to-end slice (live ingest → one pattern matcher → one replay-confirmed finding) is the target for the end of week 1.

---

## License

To be determined. Likely Apache-2.0 for the lab itself; findings released under coordinated disclosure norms.
