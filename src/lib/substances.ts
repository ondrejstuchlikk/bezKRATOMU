// The substances a user can track. Kratom has plans, scoring and the group (public.doses);
// the others are plain tracking stored in public.intakes (0017_substances.sql).

export type Substance = 'kratom' | 'caffeine'

/** Substances stored in public.intakes. Must match the CHECK constraint intakes_substance. */
export type IntakeSubstance = Exclude<Substance, 'kratom'>

export const SUBSTANCES: readonly Substance[] = ['kratom', 'caffeine']

/** Latest version of the "new substances" window (user_settings.substances_intro_seen). */
export const SUBSTANCES_INTRO_VERSION = 1

/** Largest single caffeine entry in mg (CHECK on public.intakes.amount). */
export const MAX_CAFFEINE_MG = 2000
/** Largest preset in mg (CHECK on public.intake_presets.amount_mg). */
export const MAX_PRESET_MG = 1000
/** Largest number of one preset in one entry (CHECK on public.intakes.preset_count). */
export const MAX_PRESET_COUNT = 20
export const MAX_PRESET_NAME = 40

/** Substances shown in the switcher, in a fixed order. Kratom is always tracked. */
export function trackedSubstances(settings: { trackCaffeine: boolean } | undefined): Substance[] {
  return SUBSTANCES.filter((s) => s === 'kratom' || (s === 'caffeine' && !!settings?.trackCaffeine))
}

/** Rounds to 1 decimal (the precision stored for intakes). */
export function round1(value: number): number {
  return Math.round(value * 10) / 10
}
