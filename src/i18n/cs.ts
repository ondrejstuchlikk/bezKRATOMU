// All user-facing Czech strings live here so another language can be added later.
export const cs = {
  appName: 'bezKRATOMU',
  tagline: 'Postupně, společně a bez tlaku.',
  home: {
    intro: 'Tady brzy vznikne aplikace, která ti pomůže krok za krokem snižovat dávky – s podporou kamarádů.',
    comingSoon: 'Zatím ve výstavbě',
  },
  setup: {
    supabaseMissing: 'Databáze zatím není připojená.',
    supabaseReady: 'Databáze je připojená.',
  },
  notFound: {
    title: 'Tahle stránka neexistuje',
    back: 'Zpět na úvod',
  },
} as const

export type Strings = typeof cs
