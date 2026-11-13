// The substances a user can track. Kratom has plans, scoring and the group (public.doses);
// the others are plain tracking stored in public.intakes (0017_substances.sql).

/** What the switcher shows. Nicotine covers two forms, stored as separate kinds of intake. */
export type Substance = 'kratom' | 'caffeine' | 'nicotine'

/** Kinds stored in public.intakes.substance. Must match the CHECK constraint intakes_substance. */
export type IntakeSubstance = 'caffeine' | 'cigarette' | 'snus'

/** Cigarettes and snus ("sibiř"): one entry = one piece. */
export type NicotineForm = 'cigarette' | 'snus'
export const NICOTINE_FORMS: readonly NicotineForm[] = ['cigarette', 'snus']

export const SUBSTANCES: readonly Substance[] = ['kratom', 'caffeine', 'nicotine']

/**
 * Latest version of the "new substances" window (user_settings.substances_intro_seen).
 * 1 = caffeine (0017), 2 = nicotine (0018).
 */
export const SUBSTANCES_INTRO_VERSION = 2

/** Largest single caffeine entry in mg (CHECK on public.intakes.amount). */
export const MAX_CAFFEINE_MG = 2000
/** Largest preset in mg (CHECK on public.intake_presets.amount_mg). */
export const MAX_PRESET_MG = 1000
/** Largest number of one preset in one entry (CHECK on public.intakes.preset_count). */
export const MAX_PRESET_COUNT = 20
export const MAX_PRESET_NAME = 40
/** Longest drinking time of one caffeine drink in minutes (CHECKs in 0020_caffeine_drink_time.sql). */
export const MAX_DRINK_MINUTES = 300

/** Whole minutes from 0 (all at once) to MAX_DRINK_MINUTES. */
export function validDrinkMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_DRINK_MINUTES
}

export interface TrackingSettings {
  trackCaffeine: boolean
  trackCigarettes: boolean
  trackSnus: boolean
}

/** Nicotine forms the user tracks. */
export function trackedForms(settings: TrackingSettings | undefined): NicotineForm[] {
  return NICOTINE_FORMS.filter((f) => (f === 'cigarette' ? settings?.trackCigarettes : settings?.trackSnus))
}

/** Substances shown in the switcher, in a fixed order. Kratom is always tracked. */
export function trackedSubstances(settings: TrackingSettings | undefined): Substance[] {
  return SUBSTANCES.filter(
    (s) =>
      s === 'kratom' ||
      (s === 'caffeine' && !!settings?.trackCaffeine) ||
      (s === 'nicotine' && trackedForms(settings).length > 0),
  )
}

/** Price of one piece from the pack price and size; null when no price is set. */
export function piecePrice(packPrice: number | null, packSize: number): number | null {
  return packPrice === null || packSize <= 0 ? null : packPrice / packSize
}

/** Rounds to 1 decimal (the precision stored for intakes). */
export function round1(value: number): number {
  return Math.round(value * 10) / 10
}
