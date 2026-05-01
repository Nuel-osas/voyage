import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// 30s cadence is a tradeoff. Faster surfaces candidates sooner but does more
// redundant work since the same candidate stays in the rolling window for
// minutes. persistCandidates is idempotent either way.
crons.interval(
  'run pattern matchers',
  { seconds: 30 },
  internal.detection.runMatchers.runMatchers,
  {}
);

export default crons;
