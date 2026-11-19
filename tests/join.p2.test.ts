// Check the cut, shard 2 of 8 (ACC_TOTAL / 8 runs): real pairs 1–3 cm apart on a dark table match, a foil cut on
// another wave never matches. See tests/joinScene.ts and tests/accuracy.ts.
import { describe, expect, it } from 'vitest';
import { joinShard } from './joinScene';
import { recordedCard, sheetWithText } from './cameraPhotos';
import { shardRuns, allowed } from './accuracy';
describe('join accuracy (shard 2/8)', () => {
  it('real pairs match, forged foils never match', () => {
    const spec = recordedCard({ pairing: false });
    const s = joinShard(spec, sheetWithText(spec), 200 + 31, shardRuns(8, 1));
    console.log('[join shard 2]', JSON.stringify(s));
    expect(s.falseMatch).toBe(0);
    expect(s.runs - s.matched).toBeLessThanOrEqual(allowed(s.runs, 0.04));
  });
});
