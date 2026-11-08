import { describe, expect, it } from 'vitest'
import { dailyCountsByForm, moneySpent } from './nicotine'

const e = (substance: string, localDate: string) => ({ substance, localDate })
const entries = [e('cigarette', '2026-10-01'), e('cigarette', '2026-10-01'), e('snus', '2026-10-01'), e('snus', '2026-10-03'), e('caffeine', '2026-10-03')]
const prices = { cigarettePackPrice: 160, cigarettePackSize: 20, snusPackPrice: 130, snusPackSize: 20 }

describe('nicotine', () => {
  it('counts pieces per form and day, ignoring other kinds', () => {
    expect(dailyCountsByForm(entries, '2026-10-01', '2026-10-03')).toEqual([
      { date: '2026-10-01', cigarette: 2, snus: 1 },
      { date: '2026-10-02', cigarette: 0, snus: 0 },
      { date: '2026-10-03', cigarette: 0, snus: 1 },
    ])
  })

  it('prices each piece from its pack', () => {
    // 2 × 8 Kč + 2 × 6,50 Kč
    expect(moneySpent(entries, prices)).toBe(29)
  })

  it('skips forms without a price, and is null when no form has one', () => {
    expect(moneySpent(entries, { ...prices, snusPackPrice: null })).toBe(16)
    expect(moneySpent(entries, { ...prices, snusPackPrice: null, cigarettePackPrice: null })).toBeNull()
    expect(moneySpent([], prices)).toBe(0)
  })
})
