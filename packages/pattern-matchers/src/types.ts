/**
 * Public types for pattern matchers.
 *
 * Matchers are pure functions over windows of transaction events. They have no
 * Convex dependencies and no side effects. The Convex action that drives them
 * is responsible for loading windows, persisting candidates, and enqueuing
 * replays.
 *
 * See ADR 0004 for the full rationale.
 */

export interface TxEvent {
  digest: string;
  checkpoint: number;
  timestampMs: number;
  sender: string;
  touchedSharedObjects: string[];
  valueDelta: ValueDelta[];
  flags: TxFlags;
  gasUsed: number;
}

export interface ValueDelta {
  objectId: string;
  objectType: string;
  deltaMicroSui: number;
}

export interface TxFlags {
  touchesDex: boolean;
  touchesOracle: boolean;
  touchesLending: boolean;
  isMultiHop: boolean;
}

/**
 * Read-only context provided to every matcher invocation.
 * Matchers must not fetch additional state — anything they need must be in here.
 */
export interface MatcherContext {
  /** Current Sui mainnet protocol version active for the window. */
  protocolVersion: number;
  /** Set of object IDs known to be DEX pools, by protocol. */
  dexPoolRegistry: ReadonlyMap<string, DexPoolInfo>;
  /** Set of object IDs known to be oracle objects, by feed. */
  oracleRegistry: ReadonlyMap<string, OracleInfo>;
  /** Recent oracle price snapshots, keyed by oracle object ID. */
  oraclePriceHistory: ReadonlyMap<string, OracleSnapshot[]>;
}

export interface DexPoolInfo {
  protocol: string; // e.g. 'cetus', 'turbos', 'aftermath'
  baseAsset: string;
  quoteAsset: string;
}

export interface OracleInfo {
  feed: string; // e.g. 'pyth/SUI-USD', 'switchboard/USDC-USD'
  decimals: number;
}

export interface OracleSnapshot {
  checkpoint: number;
  timestampMs: number;
  priceMicro: number; // price in 10^-6 units
}

export interface CandidateFinding {
  /** Matcher name. Stable identifier — used as a key for dedup and severity weighting. */
  pattern: string;
  /** The transactions implicated, in chronological order. */
  relatedTxDigests: string[];
  /** Checkpoint where the suspect activity occurred. */
  checkpoint: number;
  /** Free-form detail — the matcher decides the schema. */
  detail: Record<string, unknown>;
  /** Hypothesized extracted value. The replay-engine produces the authoritative number. */
  estimatedExtractionMicroSui: number;
}

export type PatternMatcher = (
  window: TxEvent[],
  context: MatcherContext
) => CandidateFinding[];
