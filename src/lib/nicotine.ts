// Nicotine (cigarettes and snus, "sibiř"): counts per form and money spent. Time between entries and
// daily averages come from src/lib/intakeStats.ts with both forms together (one entry = 1 piece).

import { piecePrice, type NicotineForm } from './substances'
import { addDays, type ISODate } from './time'

export interface NicotineEntry {
  substance: string
  localDate: ISODate
}

export interface NicotinePrices {
  cigarettePackPrice: number | null
  cigarettePackSize: number
  snusPackPrice: number | null
  snusPackSize: number
}

/** Pieces of each form per day from `from` to `to` (inclusive). */
export function dailyCountsByForm(entries: NicotineEntry[], from: ISODate, to: ISODate): ({ date: ISODate } & Record<NicotineForm, number>)[] {
  const rows: ({ date: ISODate } & Record<NicotineForm, number>)[] = []
  const index = new Map<ISODate, (typeof rows)[number]>()
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = { date: d, cigarette: 0, snus: 0 }
    rows.push(row)
    index.set(d, row)
  }
  for (const e of entries) {
    const row = index.get(e.localDate)
    if (row && (e.substance === 'cigarette' || e.substance === 'snus')) row[e.substance]++
  }
  return rows
}

/** Price of one piece of a form, or null when the user has no price set. */
export function formPiecePrice(form: NicotineForm, prices: NicotinePrices): number | null {
  return form === 'cigarette'
    ? piecePrice(prices.cigarettePackPrice, prices.cigarettePackSize)
    : piecePrice(prices.snusPackPrice, prices.snusPackSize)
}

/**
 * Money spent on the entries (at today's prices), or null when no form has a price set.
 * Entries of a form without a price count as 0.
 */
export function moneySpent(entries: NicotineEntry[], prices: NicotinePrices): number | null {
  if (formPiecePrice('cigarette', prices) === null && formPiecePrice('snus', prices) === null) return null
  let total = 0
  for (const e of entries) {
    if (e.substance === 'cigarette' || e.substance === 'snus') total += formPiecePrice(e.substance, prices) ?? 0
  }
  return Math.round(total * 100) / 100
}
