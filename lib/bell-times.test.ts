import { describe, expect, it } from 'vitest'

import { getPeriodBounds } from './bell-times'

describe('getPeriodBounds', () => {
  it('reads a plain period number', () => {
    expect(getPeriodBounds('monday', '1')).toEqual({ start: 8 * 60 + 45, end: 9 * 60 + 24 })
  })

  it('reads a split period as its own entry rather than the base period', () => {
    expect(getPeriodBounds('monday', '3b')).toEqual({ start: 10 * 60 + 32, end: 11 * 60 + 12 })
  })

  it('accepts a prefixed, upper case code', () => {
    expect(getPeriodBounds('monday', 'P6A')).toEqual(getPeriodBounds('monday', '6a'))
  })

  it('shortens period 8 on a Tuesday', () => {
    const tuesday = getPeriodBounds('tuesday', '8')
    const wednesday = getPeriodBounds('wednesday', '8')

    expect(tuesday).toEqual({ start: 14 * 60 + 18, end: 14 * 60 + 46 })
    expect(wednesday?.end).toBe(14 * 60 + 57)
  })

  it('returns null for a code the school does not run', () => {
    expect(getPeriodBounds('monday', '')).toBeNull()
    expect(getPeriodBounds('monday', 'roll call')).toBeNull()
    expect(getPeriodBounds('monday', '12')).toBeNull()
  })
})
