export type {
  TxEvent,
  ValueDelta,
  TxFlags,
  MatcherContext,
  DexPoolInfo,
  OracleInfo,
  OracleSnapshot,
  CandidateFinding,
  PatternMatcher,
} from './types.js';

export { sharedObjectSandwich } from './patterns/sharedObjectSandwich.js';
export { oracleFrontrun } from './patterns/oracleFrontrun.js';

import { sharedObjectSandwich } from './patterns/sharedObjectSandwich.js';
import { oracleFrontrun } from './patterns/oracleFrontrun.js';
import type { PatternMatcher } from './types.js';

/**
 * Registry of every matcher the lab ships with.
 *
 * The Convex action that runs detection iterates this list. New matchers are
 * added here once they have unit-test coverage and a documented hypothesis in
 * `docs/mev-patterns.md`.
 */
export const ALL_MATCHERS: ReadonlyArray<{ name: string; matcher: PatternMatcher }> = [
  { name: 'shared-object-sandwich', matcher: sharedObjectSandwich },
  { name: 'oracle-frontrun', matcher: oracleFrontrun },
];
