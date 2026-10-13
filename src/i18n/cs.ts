// All user-facing Czech strings live here so another language can be added later.

import type { AppErrorCode, FeedEventType } from '../api/types'
import type { Preset } from '../lib/plan'
import type { DayStatus } from '../lib/scoring'
import { formatGrams, formatNumber } from '../lib/units'

/** Czech plural: 1 den, 2–4 dny, 5+ dní. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n)
  if (a === 1) return one
  if (a >= 2 && a <= 4) return few
  return many
}

const days = (n: number) => `${n} ${plural(n, 'den', 'dny', 'dní')}`

export const cs = {
  appName: 'bezKRATOMU',
  tagline: 'Postupně, společně a bez tlaku.',

  common: {
    loading: 'Načítám…',
    error: 'Něco se pokazilo.',
    retry: 'Zkusit znovu',
    offline: 'Jsi offline. Data se načtou, až budeš zase online.',
    demoBanner: 'Ukázkový režim – data jsou uložená jen v tomto prohlížeči.',
    save: 'Uložit',
    saved: 'Uloženo ✓',
    cancel: 'Zrušit',
    delete: 'Smazat',
    back: 'Zpět',
    next: 'Pokračovat',
    close: 'Zavřít',
    provisional: 'předběžně',
    you: 'ty',
    grams: 'g',
    days,
    points: (n: number) => `${n > 0 ? '+' : ''}${n} b.`,
    pointsLong: (n: number) => `${n} ${plural(n, 'bod', 'body', 'bodů')}`,
  },

  errors: {
    nickname_taken: 'Tahle přezdívka už je obsazená. Zkus jinou.',
    invalid_login: 'Přezdívka nebo PIN nesedí. Zkus to znovu.',
    rate_limited: 'Příliš mnoho pokusů. Počkej chvilku a zkus to znovu.',
    network: 'Nepodařilo se spojit se serverem. Zkontroluj připojení.',
    edit_window_closed: 'Upravovat jde jen dnešek a včerejšek.',
    doses_exist: 'Na tento den už máš zapsanou dávku.',
    already_paused: 'Plán už je pozastavený.',
    plan_finished: 'Plán už je u konce, není co pozastavit.',
    unknown: 'Něco se pokazilo. Zkus to prosím znovu.',
  } satisfies Record<AppErrorCode, string>,

  nav: {
    today: 'Dnes',
    chart: 'Graf',
    leaderboard: 'Žebříček',
    group: 'Skupina',
    settings: 'Nastavení',
  },

  status: {
    met: 'Splněno',
    over: 'Překročeno',
    missed: 'Nezapsáno',
    pending: 'Nezapsáno',
    none: 'Bez plánu',
  } satisfies Record<DayStatus | 'none', string>,

  statusIcon: {
    met: '✅',
    over: '⚠️',
    missed: '💤',
    pending: '⏳',
    none: '·',
  } satisfies Record<DayStatus | 'none', string>,

  feelings: [
    { emoji: '😫', label: 'Hrozně' },
    { emoji: '😟', label: 'Špatně' },
    { emoji: '😐', label: 'Ujde to' },
    { emoji: '🙂', label: 'Dobře' },
    { emoji: '😄', label: 'Skvěle' },
  ],

  welcome: {
    title: 'Než začneš',
    intro: 'Tahle aplikace ti pomůže postupně snižovat dávky kratomu a sdílet pokroky s kamarády.',
    ack: 'Rozumím a beru na vědomí',
    continue: 'Pokračovat',
  },

  safety: {
    title: 'Bezpečnost a pomoc',
    points: [
      'Tahle aplikace není lékařská rada a nenahrazuje odbornou pomoc.',
      'Snižování dávek může vyvolat abstinenční příznaky – např. neklid, bolesti, nespavost, průjem nebo úzkost.',
      'Poraď se s lékařem, zvlášť pokud bereš vysoké dávky, kombinuješ kratom s jinými látkami nebo léky, nebo máš zdravotní potíže.',
      'Pomalejší snižování je obecně bezpečnější a snáz se vydrží.',
      'Když je ti zle nebo máš strach, neváhej si říct o pomoc.',
    ],
    contactsTitle: 'Kam se obrátit',
    call: 'Zavolat',
    open: 'Otevřít',
    back: 'Zpět',
  },

  auth: {
    loginTitle: 'Vítej zpátky',
    registerTitle: 'Nový účet',
    nickname: 'Přezdívka',
    nicknameHint: '3–20 znaků: písmena (i s diakritikou), čísla, mezera, tečka, pomlčka.',
    pin: 'PIN (6 číslic)',
    pinAgain: 'PIN znovu',
    pinWarning: 'PIN si dobře zapamatuj – nedá se obnovit.',
    login: 'Přihlásit se',
    register: 'Vytvořit účet',
    toRegister: 'Nemáš účet? Zaregistruj se',
    toLogin: 'Už máš účet? Přihlas se',
    nicknameFree: 'Přezdívka je volná ✓',
    nicknameErrors: {
      too_short: 'Přezdívka musí mít aspoň 3 znaky.',
      too_long: 'Přezdívka může mít nejvýš 20 znaků.',
      invalid_chars: 'Použij jen písmena, čísla, mezeru, tečku, pomlčku nebo podtržítko.',
      invalid_slug: 'Přezdívka musí obsahovat aspoň dvě písmena nebo číslice.',
    },
    pinInvalid: 'PIN musí mít přesně 6 číslic.',
    pinMismatch: 'PINy se neshodují.',
    demoHint: (pin: string) =>
      `Ukázka: zaregistruj se pod libovolnou přezdívkou, nebo se přihlas jako Petr, Jana, Tomáš, Lucie, Marek či Bára (PIN ${pin}).`,
  },

  wizard: {
    title: 'Nový plán',
    changeTitle: 'Změna plánu',
    step: (n: number, of: number) => `Krok ${n} z ${of}`,
    baselineQ: 'Kolik gramů si teď bereš za den?',
    baselineHint: 'Po půl gramech (např. 3 nebo 3,5). Počítej obvyklý den.',
    targetQ: 'Kolik chceš brát na konci?',
    targetHint: '0 = úplně přestat. Můžeš si zvolit i nižší udržovací dávku (po půl gramech).',
    paceQ: 'Jak rychle chceš snižovat?',
    curveQ: 'Tvar plánu',
    customDays: 'Počet dní',
    presets: {
      express: { emoji: '⚡', name: 'Expres', days: 5 },
      fast: { emoji: '🏃', name: 'Rychlá', days: 14 },
      medium: { emoji: '🚶', name: 'Střední', days: 28 },
      slow: { emoji: '🐢', name: 'Pozvolná', days: 56 },
      very_slow: { emoji: '🌱', name: 'Velmi pozvolná', days: 84 },
      custom: { emoji: '✏️', name: 'Vlastní', days: null },
    } satisfies Record<Preset, { emoji: string; name: string; days: number | null }>,
    expressWarning:
      'Expresní snižování může vyvolat silné abstinenční příznaky. Doporučujeme ho jen při nízkých dávkách a ideálně po poradě s lékařem.',
    expressHighDose: 'Při tvé dávce je expresní tempo opravdu riskantní – zvaž pomalejší plán.',
    curves: {
      decelerating: { name: 'Zpomalující ke konci', desc: 'Větší kroky na začátku, menší a delší ke konci. Doporučeno.' },
      linear: { name: 'Rovnoměrný', desc: 'Každý den zhruba stejný pokles.' },
    },
    preview: 'Náhled plánu',
    summary: (b: number, t: number, d: number) => `${formatGrams(b)} → ${formatGrams(t)} za ${days(d)}`,
    stepRow: (from: number, to: number) => (from === to ? `Den ${from}` : `Dny ${from}–${to}`),
    afterEnd: 'Po skončení plánu zůstává limit na cílové dávce.',
    start: 'Začít plán',
    replaceNote: 'Nový plán začne dnes. Ten dosavadní zůstane v historii a grafech.',
    errors: {
      invalid_baseline: 'Zadej dávku od 0,5 do 300 g po půl gramech (např. 2 nebo 2,5).',
      invalid_target: 'Cíl musí být menší než současná dávka, po půl gramech (např. 0, 0,5 nebo 1).',
      invalid_duration: 'Zadej počet dní od 1 do 365.',
    },
    dayAxis: 'den',
  },

  today: {
    greeting: (name: string) => `Ahoj, ${name}`,
    limit: 'Dnešní limit',
    taken: 'Zatím',
    remaining: 'Zbývá',
    overBy: 'Nad limitem o',
    zeroTarget: 'Dnešní cíl je 0 g. Zvládneš to! 💚',
    addDose: 'Přidat dávku',
    zeroDay: 'Dnes jsem si nic nevzal(a)',
    zeroMarked: 'Zapsáno: dnes nic 🌱',
    undo: 'Zrušit',
    doses: 'Dnešní dávky',
    noDoses: 'Zatím žádná dávka.',
    paused: 'Plán je pozastavený – limit se drží na současné dávce.',
    yesterday: 'Včera',
    yesterdayMissing: 'Včerejšek není zapsaný. Doplň ho, dokud to jde.',
    yesterdayZero: 'Včera jsem si nic nevzal(a)',
    yesterdayAdd: 'Doplnit včerejší dávku',
    yesterdayDoses: (n: number) => `${n} ${plural(n, 'dávka', 'dávky', 'dávek')}`,
    pointsToday: 'Body za dnešek',
    streak: 'Série',
    total: 'Celkem',
    encouragement: [
      'Nevadí. Jeden těžší den nic nemaže – jsi pořád na cestě. 💚',
      'Díky, že to poctivě zapisuješ. I to je kus práce.',
      'Zítra je nový den. Buď na sebe hodný/á.',
      'Těžké dny k tomu patří. Zkus si říct, co dnes pomohlo a co ne.',
    ],
    metMessage: 'Krásná práce, drž se! 🌿',
  },

  dose: {
    addTitle: 'Nová dávka',
    editTitle: 'Upravit dávku',
    unitG: 'g',
    unitTsp: 'lžička',
    tspAmount: (n: string) => `${n} ${'lžič.'}`,
    /** Shown next to grams for users with a configured teaspoon: "≈ 1,2 lžič." */
    tspApprox: (tsp: number) => `≈ ${formatNumber(tsp)} lžič.`,
    tspSetupHint: 'Tip: nastav si v Nastavení velikost lžičky a uvidíš limit i v lžičkách.',
    equals: (g: string) => `= ${g}`,
    day: 'Den',
    todayLabel: 'Dnes',
    yesterdayLabel: 'Včera',
    time: 'Čas',
    feeling: 'Jak se cítíš?',
    optional: 'nepovinné',
    note: 'Poznámka',
    notePlaceholder: 'Krátká poznámka…',
    save: 'Uložit dávku',
    delete: 'Smazat dávku',
    confirmDelete: 'Opravdu smazat tuto dávku?',
    invalidAmount: 'Zadej množství větší než 0 (nejvýš 200 g).',
    futureTime: 'Čas nemůže být v budoucnosti.',
  },

  chart: {
    title: 'Graf',
    noPlan: 'Grafy se ukážou, jakmile začneš plán.',
    ranges: { 14: '14 dní', 30: '30 dní', 0: 'Vše' } as Record<number, string>,
    main: 'Plán a skutečnost',
    plan: 'Limit',
    actual: 'Skutečnost',
    paused: 'Pauza',
    timeOfDay: 'Kdy si dávky bereš',
    timeOfDayHint: 'Počet dávek podle hodiny',
    feelings: 'Pocity a dávka',
    feelingAvg: 'Průměrný pocit',
    points: 'Body v čase',
    cumulative: 'Součet bodů',
    noData: 'Zatím málo dat.',
    pctNote: (name: string) => `V % původní dávky – ${name} nesdílí přesné gramy.`,
  },

  stats: {
    points: 'Body',
    metDays: 'Splněné dny',
    streak: 'Aktuální série',
    bestStreak: 'Nejdelší série',
    reductionLimit: 'Snížení limitu',
    reductionAvg: 'Snížení (7denní průměr)',
    moneySaved: 'Ušetřeno',
    moneyHint: 'Odhad podle tvé ceny za gram.',
  },

  leaderboard: {
    title: 'Žebříček',
    tabs: {
      points: 'Body',
      streak: 'Aktuální série',
      met: 'Splněné dny (%)',
      reduction: 'Snížení (%)',
    },
    empty: 'Zatím tu nikdo není.',
    noPlan: 'bez plánu',
  },

  group: {
    title: 'Skupina',
    todaySummary: (met: number, of: number, pending: number) =>
      `Dnes zatím splnilo ${met} z ${of}${pending ? ` · nezapsáno ${pending}` : ''}`,
    yesterdaySummary: (met: number, of: number) => `Včera splnilo ${met} z ${of}`,
    members: 'Jak se dnes daří',
    feed: 'Aktivita',
    feedEmpty: 'Zatím žádné události.',
    showFeed: 'Zobrazit aktivitu',
    hideFeed: 'Skrýt aktivitu',
    events: {
      plan_started: (name: string, p: Record<string, unknown>) =>
        `${name} začal(a) nový plán${p.duration_days ? ` na ${days(Number(p.duration_days))}` : ''}`,
      streak: (name: string, p: Record<string, unknown>) => `${name} má ${days(Number(p.days))} v řadě splněno 🔥`,
      half_baseline: (name: string) => `${name} je na polovině původní dávky 🎉`,
      target_reached: (name: string) => `${name} dosáhl(a) cílové dávky 🏁`,
      first_zero_day: (name: string) => `${name} má první den úplně bez kratomu 🌱`,
    } satisfies Record<FeedEventType, (name: string, payload: Record<string, unknown>) => string>,
  },

  profile: {
    recentDays: 'Poslední dny',
    notFound: 'Uživatel nenalezen.',
    noPlan: 'Zatím nemá plán.',
    isYou: 'Tvůj profil',
  },

  day: {
    reactions: 'Povzbuď',
    comments: 'Komentáře',
    noComments: 'Zatím žádné komentáře.',
    placeholder: 'Napiš povzbuzení…',
    send: 'Odeslat',
    limit: 'Limit',
    intake: 'Vzato',
    ofLimit: 'z limitu',
    zeroDay: 'Den bez kratomu 🌱',
    final: 'konečné',
    ownDayNote: 'Na svůj den reagovat nemůžeš, ale ostatní ano.',
  },

  settings: {
    title: 'Nastavení',
    loggedAs: 'Přihlášen(a) jako',
    teaspoon: 'Moje lžička',
    teaspoonHint: 'Kolik gramů má tvoje lžička? Pak můžeš zapisovat v lžičkách.',
    teaspoonPlaceholder: 'např. 2,5',
    price: 'Cena za gram',
    priceHint: 'V Kč. Slouží jen k odhadu ušetřených peněz.',
    pricePlaceholder: 'např. 4',
    share: 'Sdílet přesné gramy',
    shareHint: 'Ostatní uvidí tvoje gramy. Když je vypnuto, vidí jen procenta, body a stav dne.',
    theme: 'Vzhled',
    themes: { system: 'Systém', light: 'Světlý', dark: 'Tmavý' },
    plan: 'Můj plán',
    safety: 'Bezpečnost a pomoc',
    logout: 'Odhlásit se',
    resetDemo: 'Smazat ukázková data',
    resetDemoConfirm: 'Smazat všechna ukázková data v tomto prohlížeči?',
    invalidNumber: 'Zadej kladné číslo.',
  },

  plan: {
    title: 'Můj plán',
    started: 'Začátek',
    ends: 'Konec plánu',
    endsPaused: 'Konec se posouvá o dny pauzy',
    preset: 'Tempo',
    curve: 'Tvar',
    todayLimit: 'Dnešní limit',
    pause: 'Zůstanu na současné dávce',
    pauseHint:
      'Limit se zastaví na dnešní hodnotě a zbytek plánu se posune o délku pauzy. Za pauzu nejsou žádné srážky – dny se hodnotí normálně podle drženého limitu.',
    resume: 'Pokračovat v plánu',
    pausedSince: (date: string) => `Pozastaveno od ${date}`,
    change: 'Změnit plán',
    finished: (t: number) => `Plán je dokončený 🎉 Limit zůstává na ${formatGrams(t)}.`,
    none: 'Zatím nemáš žádný plán.',
    create: 'Vytvořit plán',
  },

  notFound: {
    title: 'Tahle stránka neexistuje',
    back: 'Zpět na úvod',
  },
} as const

export type Strings = typeof cs
