// Pattern matchers are pure functions over a window of transaction events.
// They produce candidate findings; verification happens elsewhere in the
// replay engine. See ADR 0004.

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

// Read-only context every matcher receives. Anything a matcher needs has to
// be in here; matchers can't fetch on demand.
export interface MatcherContext {
  protocolVersion: number;
  dexPoolRegistry: ReadonlyMap<string, DexPoolInfo>;
  oracleRegistry: ReadonlyMap<string, OracleInfo>;
  oraclePriceHistory: ReadonlyMap<string, OracleSnapshot[]>;
}

export interface DexPoolInfo {
  protocol: string;
  baseAsset: string;
  quoteAsset: string;
}

export interface OracleInfo {
  feed: string;
  decimals: number;
}

export interface OracleSnapshot {
  checkpoint: number;
  timestampMs: number;
  priceMicro: number;
}

export interface CandidateFinding {
  pattern: string;
  relatedTxDigests: string[];
  checkpoint: number;
  detail: Record<string, unknown>;
  // Hypothesis only. Replay produces the authoritative extraction figure.
  estimatedExtractionMicroSui: number;
}

export type PatternMatcher = (
  window: TxEvent[],
  context: MatcherContext
) => CandidateFinding[];
