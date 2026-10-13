import { describe, expect, it } from 'vitest'
import { isValidPin, slugifyNickname, validateNickname } from './nickname'
import { addDays, diffDays, pragueDate, pragueLocalToInstant, pragueTime } from './time'
import { gramsToCg, gramsToTeaspoons, parseDecimal, toGrams } from './units'

describe('units', () => {
  it('converts a limit to teaspoons, rounding down to 0.1', () => {
    expect(gramsToTeaspoons(3, 2.5)).toBe(1.2)
    expect(gramsToTeaspoons(5, 2.5)).toBe(2) // exact, no floating-point drift
    expect(gramsToTeaspoons(2.5, 3)).toBe(0.8) // 0.833… → never above the limit
    expect(gramsToTeaspoons(0.5, 2.4)).toBe(0.2)
  })

  it('converts teaspoons to grams with 2 decimals', () => {
    expect(toGrams(2, 'tsp', 2.4)).toBe(4.8)
    expect(toGrams(1.5, 'tsp', 2.33)).toBe(3.5) // 3.495 → 3.5
    expect(toGrams(3.333, 'g', null)).toBe(3.33)
    expect(() => toGrams(1, 'tsp', null)).toThrow()
  })

  it('parses decimal commas', () => {
    expect(parseDecimal('2,5')).toBe(2.5)
    expect(parseDecimal(' 3 ')).toBe(3)
    expect(parseDecimal('abc')).toBeNaN()
    expect(parseDecimal('-1')).toBeNaN()
  })

  it('converts grams to integer centigrams without float drift', () => {
    expect(gramsToCg(0.1 + 0.2)).toBe(30)
    expect(gramsToCg(4.35)).toBe(435)
  })
})

describe('nickname', () => {
  it('builds ASCII slugs', () => {
    expect(slugifyNickname('Petr Novák')).toBe('petr-novak')
    expect(slugifyNickname('Šárka_Ž.')).toBe('sarka-z')
    expect(slugifyNickname('ŘÍHA')).toBe('riha')
  })

  it('validates nicknames and PINs', () => {
    expect(validateNickname('Jo')).toBe('too_short')
    expect(validateNickname('Petr 🙂')).toBe('invalid_chars')
    expect(validateNickname('___')).toBe('invalid_slug')
    expect(validateNickname('Lucie')).toBeNull()
    expect(isValidPin('123456')).toBe(true)
    expect(isValidPin('12345')).toBe(false)
    expect(isValidPin('12345a')).toBe(false)
  })
})

describe('Prague time', () => {
  it('maps instants to Prague calendar days', () => {
    expect(pragueDate(new Date('2026-10-11T22:30:00Z'))).toBe('2026-10-12') // 00:30 CEST
    expect(pragueDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01') // 00:30 CET
  })

  it('converts local times across DST changes', () => {
    expect(pragueLocalToInstant('2026-07-01', '08:00').toISOString()).toBe('2026-07-01T06:00:00.000Z')
    expect(pragueLocalToInstant('2026-01-15', '08:00').toISOString()).toBe('2026-01-15T07:00:00.000Z')
    // Spring forward (02:00 → 03:00 on 29 March 2026)
    expect(pragueLocalToInstant('2026-03-29', '01:30').toISOString()).toBe('2026-03-29T00:30:00.000Z')
    expect(pragueLocalToInstant('2026-03-29', '03:30').toISOString()).toBe('2026-03-29T01:30:00.000Z')
    // Fall back (03:00 → 02:00 on 25 October 2026)
    expect(pragueTime(pragueLocalToInstant('2026-10-25', '04:00'))).toBe('04:00')
    expect(pragueDate(pragueLocalToInstant('2026-10-25', '23:59'))).toBe('2026-10-25')
  })

  it('does date arithmetic across DST', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(diffDays('2026-10-26', '2026-10-24')).toBe(2)
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
