import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

/**
 * Scheduled work.
 *
 * runMatchers fires every 30 seconds over a rolling 5-minute window. This
 * cadence is a tradeoff: faster means the dashboard surfaces candidates
 * sooner; slower reduces redundant work since a candidate visible in window
 * t will also be visible in window t+1 unless the window has rolled past it.
 *
 * Idempotency in persistCandidates means re-detecting a candidate is safe
 * and silent.
 */

const crons = cronJobs();

crons.interval(
  'run pattern matchers',
  { seconds: 30 },
  internal.detection.runMatchers.runMatchers,
  {}
);

export default crons;
