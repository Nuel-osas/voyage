# ADR 0002: Filter Shared-Object Mutations at the Ingest Boundary

**Status:** Accepted
**Decision drivers:** cost, signal-to-noise ratio, MEV theory

## Context

Sui's parallel-execution claim rests on a specific architectural property: transactions that touch only owned objects can execute in parallel without coordination. Only transactions that touch shared objects are sequenced through consensus and could plausibly host MEV.

This is both a theoretical observation and an operational one: if MEV exists on Sui, it almost certainly involves shared-object access. Ingesting transactions that touch only owned objects is therefore expensive noise.

## Decision

The `ingest-bridge` filters at source. A transaction is forwarded to Convex if and only if at least one of:

- It mutates a shared object.
- It touches a known DEX pool object (curated allow-list).
- It touches a known oracle object (curated allow-list).
- It is one of multiple transactions in the same checkpoint with overlapping touched-object sets and distinct senders (sandwich-shape signature).

All other transactions are dropped at the boundary and never reach Convex.

## Consequences

### Positive

- Volume reduction in the 60-90% range during typical mainnet activity. Cost-bounded.
- Stored data is by definition relevant to MEV detection. Signal-to-noise is high.
- Pattern matchers work on smaller windows and finish faster.

### Negative

- **Selection bias.** Any MEV pattern that does not involve shared objects is invisible to us. This is a known and accepted limitation. The lab's null result, if produced, applies only to shared-object-mediated MEV.
- The DEX/oracle allow-lists must be maintained as protocols launch. A new DEX that uses a non-standard pool object pattern could be missed.

### Mitigations

- Document the selection criterion prominently in any published findings or null result.
- Audit the allow-list weekly; subscribe to Sui ecosystem releases to catch new protocols.
- Sample 1% of dropped transactions into a parallel "control" bucket to spot-check that no surprising MEV shape is being filtered out.
