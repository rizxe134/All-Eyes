import { describe, expect, it } from 'vitest'
import { chooseHit } from '../src/core/pick'

describe('chooseHit', () => {
  const near = { id: 'near', d: 3 }
  const mid = { id: 'mid', d: 8 }
  const far = { id: 'far', d: 11 }

  it('picks the nearest contact', () => {
    const hit = chooseHit([far, near, mid], '', -1)
    expect(hit?.item.id).toBe('near')
    expect(hit?.index).toBe(0)
  })

  it('cycles overlaps when the same set is clicked again', () => {
    const first = chooseHit([far, near, mid], '', -1)
    const second = chooseHit([mid, far, near], first!.key, first!.index)
    const third = chooseHit([near, mid, far], second!.key, second!.index)
    const fourth = chooseHit([far, mid, near], third!.key, third!.index)
    expect(second?.item.id).toBe('mid')
    expect(third?.item.id).toBe('far')
    expect(fourth?.item.id).toBe('near')
  })

  it('starts over when the set under the cursor changes', () => {
    const first = chooseHit([near, mid], '', -1)
    const next = chooseHit([far], first!.key, first!.index)
    expect(next?.item.id).toBe('far')
    expect(next?.index).toBe(0)
  })

  it('breaks distance ties by id so the cycle stays stable', () => {
    const hit = chooseHit([{ id: 'b', d: 4 }, { id: 'a', d: 4 }], '', -1)
    expect(hit?.item.id).toBe('a')
    expect(hit?.key).toBe('a|b')
  })

  it('returns null when nothing is in range', () => {
    expect(chooseHit([], 'x', 1)).toBeNull()
  })
})
