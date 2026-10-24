import { describe, expect, it } from 'vitest'
import { categorize, findPlace, locateHeadline, spread } from '../src/desk/news-geo'

describe('news locations', () => {
  it('finds the story place in the headline', () => {
    const at = locateHeadline('Drone strike hits Kyiv overnight', '', 'GB')
    expect(at?.locatedBy).toBe('PLACE IN HEADLINE')
    expect(at?.place).toBe('Kyiv')
  })
  it('prefers longer names and ignores the pronoun us', () => {
    expect(findPlace('Talks with North Korea resume')?.name).toBe('North Korea')
    expect(findPlace('Tell us what you think')).toBeNull()
  })
  it('falls back to summary, then outlet country, then nothing', () => {
    expect(locateHeadline('Talks resume', 'Delegates met in Cairo', 'QA')?.locatedBy).toBe('PLACE IN SUMMARY')
    expect(locateHeadline('Talks resume', '', 'QA')?.locatedBy).toBe('OUTLET COUNTRY')
    expect(locateHeadline('Talks resume', '', '')).toBeNull()
  })
  it('categorizes', () => {
    expect(categorize('Missile attack on port')).toBe('conflict')
    expect(categorize('Stocks fall as inflation rises')).toBe('business')
    expect(categorize('NASA telescope spots planet')).toBe('science')
    expect(categorize('Election day')).toBe('world')
  })
  it('spreads stacked points', () => {
    const out = spread([{ lat: 1, lon: 1 }, { lat: 1, lon: 1 }])
    expect(out[1].lat !== 1 || out[1].lon !== 1).toBe(true)
  })
})
