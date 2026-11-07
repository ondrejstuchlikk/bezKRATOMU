/** History shown in the V těle teď chart, in hours. 72+ = whole days, picked from the "more" menu. */
export type PastHours = 12 | 24 | 48 | 72 | 120 | 168
export const HOUR_OPTIONS: PastHours[] = [12, 24, 48]
export const DAY_OPTIONS: PastHours[] = [72, 120, 168]
