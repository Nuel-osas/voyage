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

// Add new matchers here once they have tests and a documented hypothesis in
// docs/mev-patterns.md. Order matters only for the order findings appear in
// the dashboard's per-window summary.
export const ALL_MATCHERS: ReadonlyArray<{ name: string; matcher: PatternMatcher }> = [
  { name: 'shared-object-sandwich', matcher: sharedObjectSandwich },
  { name: 'oracle-frontrun', matcher: oracleFrontrun },
];
