import { describe, expect, it } from 'vitest'
import { modelCredit, viewModelUrl } from '../src/ui/view-models'

describe('viewer model credits', () => {
  it('attributes the CC-BY airliners', () => {
    for (const id of ['air-a320', 'air-b737', 'air-a350', 'air-a380', 'air-b777']) {
      const credit = modelCredit(id)
      expect(credit.text.toLowerCase()).toContain('amvlab')
      expect(credit.license).toContain('CC BY')
      expect(credit.href).toContain('amvlab/aircraft-models')
      expect(viewModelUrl(id)).toMatch(/\.glb$/)
    }
    expect(modelCredit('air-b777').text.toLowerCase()).toContain('787')
  })

  it('attributes the NASA models as public domain', () => {
    for (const id of ['air-heli', 'sat-wx', 'sat-nav', 'sat-science']) {
      const credit = modelCredit(id)
      expect(credit.text).toContain('NASA')
      expect(credit.license.toLowerCase()).toContain('public domain')
      expect(viewModelUrl(id)).toBe(`/models/${id}.glb`)
    }
  })

  it('credits original procedural families', () => {
    for (const id of ['air-b747', 'air-prop', 'air-fighter', 'ship-cargo', 'sat-station', 'sat-comms']) {
      const credit = modelCredit(id)
      expect(credit.text).toContain('All Eyes contributors')
      expect(credit.license).toBe('MIT')
      expect(viewModelUrl(id)).toBeNull()
    }
  })
})
