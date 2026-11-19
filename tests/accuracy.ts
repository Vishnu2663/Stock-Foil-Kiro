// How many random runs the heavy accuracy tests make: 50 in total by default, 200 with ACCURACY=1
// (npm run test:accuracy). Each test is split into shard files so they run in parallel.
export const ACC_TOTAL = typeof process !== 'undefined' && process.env.ACCURACY === '1' ? 200 : 50;
/** Runs for shard i (0-based) of n, so the shards add up to ACC_TOTAL. */
export const shardRuns = (n: number, i: number) => Math.floor(ACC_TOTAL / n) + (i < ACC_TOTAL % n ? 1 : 0);
/** Misses allowed for a share `rate` of `n` cases (at least 1 when n > 0, so small default runs are not flaky). */
export const allowed = (n: number, missRate: number) => (n ? Math.max(1, Math.floor(n * missRate)) : 0);
