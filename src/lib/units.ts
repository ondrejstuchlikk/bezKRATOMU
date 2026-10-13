export type InputUnit = 'g' | 'tsp'

export const MAX_DOSE_G = 200

/** Rounds to 2 decimals (the precision stored in the database). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function toGrams(amount: number, unit: InputUnit, teaspoonGrams: number | null): number {
  if (unit === 'g') return round2(amount)
  if (!teaspoonGrams) throw new Error('teaspoon_not_configured')
  return round2(amount * teaspoonGrams)
}

/**
 * Teaspoons that fit within `grams`, rounded down to 0.1 so that taking this many
 * spoons never exceeds the given amount.
 */
export function gramsToTeaspoons(grams: number, teaspoonGrams: number): number {
  return Math.floor((grams / teaspoonGrams) * 10 + 1e-9) / 10
}

export function gramsToCg(grams: number): number {
  return Math.round(grams * 100)
}

/** Parses user input that may use a decimal comma ("2,5"). Returns NaN when invalid. */
export function parseDecimal(input: string): number {
  const normalized = input.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return NaN
  return Number(normalized)
}

const gramFormat = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 })
const oneDecimal = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 })
const money = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 })

/** "2,5" */
export function formatNumber(value: number): string {
  return gramFormat.format(value)
}

/** "2,5 g" */
export function formatGrams(value: number): string {
  return `${gramFormat.format(value)} g`
}

/** "42 %" */
export function formatPct(value: number): string {
  return `${oneDecimal.format(value)} %`
}

/** "1 250 Kč" */
export function formatMoney(value: number): string {
  return money.format(value)
}
