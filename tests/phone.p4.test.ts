// Phone scan accuracy, shard 4 of 4 (ACC_TOTAL / 4 property runs; see tests/accuracy.ts and tests/phoneCase.ts).
import { describe, expect, it } from 'vitest';
import { phoneShard } from './phoneCase';
import { shardRuns } from './accuracy';
describe('phone accuracy (shard 4/4)', () => {
  it('simulated phone frames: no false or missed punch, glare is unsure, readable frames are not skipped', () => {
    const n = shardRuns(4, 3);
    const s = phoneShard(4000 + 17, n);
    console.log('[phone shard 4]', JSON.stringify(s));
    expect(s.frames).toBe(n);
    expect(s.wrong).toBe(0);
    expect(s.frames - s.reads).toBeLessThanOrEqual(Math.max(1, Math.floor(n * 0.1)));
  });
});
