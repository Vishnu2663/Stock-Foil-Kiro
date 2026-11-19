// Received-mark detector, shard 3 of 4 (ACC_TOTAL / 4 runs) on simulated photos of the real sheet:
// tilt ±10°, blur 1.5 px, uneven light, JPEG 0.6, 3–4 px/mm. See tests/receiptSim.ts and tests/accuracy.ts.
import { describe, expect, it } from 'vitest';
import { receiptShard } from './receiptSim';
import { shardRuns, allowed } from './accuracy';
describe('received mark accuracy (shard 3/4)', () => {
  it('thumbs are thumbs, empty is never present, glare and fingers are unclear', () => {
    const s = receiptShard(3000 + 7, shardRuns(4, 2));
    console.log('[receipt shard 3]', JSON.stringify(s));
    expect(s.falsePresent).toBe(0);
    expect(s.thumb.n - s.thumb.ok).toBeLessThanOrEqual(allowed(s.thumb.n, 0.03));
    expect(s.empty.ok).toBe(s.empty.n);
    expect(s.glare.ok).toBe(s.glare.n);
    expect(s.finger.ok).toBe(s.finger.n);
  });
});
