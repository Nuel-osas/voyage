# ADR 0004: Pattern Matchers as Pure Functions

**Status:** Accepted
**Decision drivers:** testability, portability, correctness

## Context

Pattern matchers are the heart of the lab's intellectual property. Each matcher encodes a hypothesis about a class of MEV — sandwich, JIT, oracle frontrun, atomic arbitrage. They must be:

- **Testable in isolation** without spinning up Convex or Sui.
- **Reusable** across the live online path (Convex scheduled actions over rolling windows) and the offline backfill path (a Node.js script over a full historical export).
- **Inspectable** — researchers must be able to read a matcher and understand exactly what it claims.

A matcher tightly coupled to Convex's API would fail all three.

## Decision

Every pattern matcher is a pure function with the signature:

```ts
type PatternMatcher = (
  window: TxEvent[],
  context: MatcherContext
) => CandidateFinding[];
```

Where:

- `window` is a chronologically ordered batch of transaction events.
- `context` is read-only metadata (current Sui protocol version, known pool registry, etc.).
- The return is a possibly-empty list of candidates.

Matchers have no side effects, make no network calls, and have no awareness of Convex.

The Convex action that drives matchers is responsible for: loading the window, calling each matcher, persisting candidates, and enqueuing replays. That separation is strict.

## Consequences

### Positive

- Each matcher has a unit test suite that runs in milliseconds.
- The same matcher code runs in Convex live and in offline batch backfill, guaranteeing parity.
- A new researcher can add a matcher by writing one TypeScript file and one test file. No Convex knowledge required.
- Pattern-detection logic is portable. If we ever move off Convex, matchers don't change.

### Negative

- Matchers cannot read additional context lazily. If a matcher needs the historical price of an oracle 100 blocks ago, that data must be passed in via `context` rather than fetched on demand.
- The action driver code has more responsibility — assembling the right context, persisting results.

### Mitigations

- The `context` object is intentionally generous. We pass the full pool registry, oracle registry, and recent price history snapshots, even if a given matcher uses only a subset.
- The driver action is small and well-tested. Its only job is plumbing.
