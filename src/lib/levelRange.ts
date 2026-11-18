/** History shown in the V těle teď chart, in hours. 72+ = whole days, picked from the "more" menu. */
export type PastHours = 12 | 24 | 48 | 72 | 120 | 168
export const HOUR_OPTIONS: PastHours[] = [12, 24, 48]
export const DAY_OPTIONS: PastHours[] = [72, 120, 168]
export const PAST_OPTIONS: PastHours[] = [...HOUR_OPTIONS, ...DAY_OPTIONS]
export const DEFAULT_PAST_H: PastHours = 24

/** The chosen chart range is a per-device convenience, so localStorage is fine (and optional). */
export function readPastHours(key: string): PastHours {
  try {
    const v = Number(localStorage.getItem(key))
    return PAST_OPTIONS.includes(v as PastHours) ? (v as PastHours) : DEFAULT_PAST_H
  } catch {
    return DEFAULT_PAST_H
  }
}

export function savePastHours(key: string, h: PastHours) {
  try {
    localStorage.setItem(key, String(h))
  } catch {
    // ignore (private mode etc.)
  }
}
