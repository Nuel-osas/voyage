# ADR 0004: Pattern matchers are pure functions

Every matcher has the signature:

```ts
type PatternMatcher = (
  window: TxEvent[],
  context: MatcherContext
) => CandidateFinding[];
```

No Convex imports. No network calls. No side effects.

This is the most important boundary in the codebase, because pattern logic is the actual research. Tying it to Convex would mean:

- I can't unit-test a matcher without spinning up a Convex deployment.
- I can't run the same code offline against a historical export.
- A new researcher contributing a matcher would need to learn Convex first.

So the rule is hard: matchers are dependency-free. The Convex action that drives them is responsible for loading the window, building the context, calling each matcher, and persisting candidates. That driver is small and well-tested.

The cost is that matchers can't lazily fetch context. If a matcher needs the price of an oracle 100 blocks ago, the driver has to pass it in. The `MatcherContext` is intentionally generous - we pass the full pool registry, oracle registry, and recent oracle snapshots whether or not a given matcher uses them. A few hundred bytes of unused context per call is cheap; a matcher that secretly hits the network is not.
