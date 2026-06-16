import assert from 'node:assert'
import { describe, it } from 'node:test'
import { groupBySlidingWindow } from './groupBySlidingWindow'

describe('groupBySlidingWindow', () => {
  it('returns empty array for empty input', () => {
    const result = groupBySlidingWindow([], () => 0, 1000, 3)
    assert.strictEqual(result.length, 0)
  })

  it('returns empty array when single item is below threshold', () => {
    const items = [{ t: 100 }]
    const result = groupBySlidingWindow(items, i => i.t, 1000, 3)
    assert.strictEqual(result.length, 0)
  })

  it('groups items when all fall within the window and meet threshold', () => {
    const items = [{ t: 100 }, { t: 200 }, { t: 300 }]
    const result = groupBySlidingWindow(items, i => i.t, 500, 3)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0]!.startIndex, 0)
    assert.strictEqual(result[0]!.endIndex, 2)
    assert.strictEqual(result[0]!.count, 3)
    assert.strictEqual(result[0]!.startTime, 100)
    assert.strictEqual(result[0]!.endTime, 300)
  })

  it('creates separate groups for clusters with gaps', () => {
    const items = [
      { t: 100 },
      { t: 200 },
      { t: 300 }, // group 1
      { t: 1000 },
      { t: 1100 },
      { t: 1200 }, // group 2
    ]
    const result = groupBySlidingWindow(items, i => i.t, 500, 3)
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0]!.startIndex, 0)
    assert.strictEqual(result[0]!.endIndex, 2)
    assert.strictEqual(result[1]!.startIndex, 3)
    assert.strictEqual(result[1]!.endIndex, 5)
  })

  it('advances by 1 when threshold is not met', () => {
    // Items at 100, 110, 1200, 1300, 1400
    // 100: has 110 within window (2 items < 3 threshold) → advance to 110
    // 110: has no others within window → advance to 1200
    // 1200: has 1300, 1400 within window (3 items = 3 threshold) → group
    const items = [
      { t: 100 },
      { t: 110 },
      { t: 1200 },
      { t: 1300 },
      { t: 1400 },
    ]
    const result = groupBySlidingWindow(items, i => i.t, 500, 3)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0]!.startIndex, 2)
    assert.strictEqual(result[0]!.endIndex, 4)
  })

  it('handles exact window boundary (inclusive)', () => {
    const items = [{ t: 0 }, { t: 1000 }, { t: 2000 }]
    const result = groupBySlidingWindow(items, i => i.t, 2000, 3)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0]!.count, 3)
    assert.strictEqual(result[0]!.startIndex, 0)
    assert.strictEqual(result[0]!.endIndex, 2)
  })

  it('handles items with same timestamp', () => {
    const items = [{ t: 100 }, { t: 100 }, { t: 100 }]
    const result = groupBySlidingWindow(items, i => i.t, 0, 3)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0]!.count, 3)
  })

  it('leaves trailing items ungrouped when below threshold', () => {
    const items = [
      { t: 100 },
      { t: 200 },
      { t: 300 }, // group (3 items within 500ms)
      { t: 2000 },
      { t: 2100 }, // trailing (2 items < 3 threshold)
    ]
    const result = groupBySlidingWindow(items, i => i.t, 500, 3)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0]!.startIndex, 0)
    assert.strictEqual(result[0]!.endIndex, 2)
  })
})
