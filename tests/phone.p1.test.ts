// Phone scan accuracy, shard 1 of 4 (ACC_TOTAL / 4 property runs; see tests/accuracy.ts and tests/phoneCase.ts).
import { describe, expect, it } from 'vitest';
import { phoneShard } from './phoneCase';
import { shardRuns } from './accuracy';
describe('phone accuracy (shard 1/4)', () => {
  it('simulated phone frames: no false or missed punch, glare is unsure, readable frames are not skipped', () => {
    const n = shardRuns(4, 0);
    const s = phoneShard(1000 + 17, n);
    console.log('[phone shard 1]', JSON.stringify(s));
    expect(s.frames).toBe(n);
    expect(s.wrong).toBe(0);
    expect(s.frames - s.reads).toBeLessThanOrEqual(Math.max(1, Math.floor(n * 0.1)));
    expect(s.liveWrong).toBe(0);
    expect(s.frames - s.liveReads).toBeLessThanOrEqual(Math.max(1, Math.floor(n * 0.1)));
  });
});
