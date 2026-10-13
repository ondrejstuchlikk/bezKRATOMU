// Demo mode: a complete in-browser backend used while Supabase is not
// configured. Data lives in localStorage; a few made-up friends with history
// are generated deterministically so every screen has something to show.
// Scoring uses the same rules as the server (src/lib/days.ts mirrors SQL).

import { computeDays, computeStats, deriveDayEvents, type DayActivity, type DayRow } from '../lib/days'
import { slugifyNickname } from '../lib/nickname'
import { buildPlanDays, customPlanParams, type Curve, type PauseRecord, type PlanDay, type PlanRecord, type Preset } from '../lib/plan'
import { addDays, pragueDate, pragueLocalToInstant, pragueToday, type ISODate } from '../lib/time'
import { gramsToCg, round2 } from '../lib/units'
import {
  AppError,
  REACTION_EMOJIS,
  type ActivePlan,
  type Backend,
  type DayResult,
  type Dose,
  type DoseInput,
  type FeedEvent,
  type ReactionEmoji,
  type SessionUser,
} from './types'

const STORAGE_KEY = 'bezkratomu-demo-v1'
export const DEMO_PIN = '123456'

interface DemoUser {
  id: string
  nickname: string
  slug: string
  pin: string
  shareGrams: boolean
  teaspoonGrams: number | null
  pricePerGram: number | null
  /** Optional because demo data saved by older versions doesn't have them. */
  reminderHour?: number | null
  notifySocial?: boolean
  /** Simulated friend: doses are generated instead of stored. */
  bot: { seed: number; missRate: number; overRate: number; usesTeaspoon: boolean } | null
}

interface DemoPlan extends PlanRecord {
  userId: string
  preset: Preset
  status: 'active' | 'replaced'
  createdAt: string
}

interface DemoPause extends PauseRecord {
  id: string
  planId: string
}

interface DemoDose extends Dose {
  userId: string
}

interface DemoReaction {
  id: string
  fromUser: string
  targetUser: string
  date: ISODate
  emoji: ReactionEmoji
}

interface DemoComment {
  id: string
  authorId: string
  targetUser: string
  date: ISODate
  body: string
  createdAt: string
}

interface DemoState {
  version: 1
  users: DemoUser[]
  plans: DemoPlan[]
  pauses: DemoPause[]
  doses: DemoDose[]
  zeroDays: { userId: string; date: ISODate }[]
  reactions: DemoReaction[]
  comments: DemoComment[]
  sessionUserId: string | null
}

// ---------------------------------------------------------------------------
// Deterministic randomness for the simulated friends
// ---------------------------------------------------------------------------

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const uid = () => crypto.randomUUID()

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

interface BotSpec {
  nickname: string
  baselineG: number
  targetG: number
  preset: Preset
  durationDays: number
  curve: Curve
  startedDaysAgo: number
  pausedDaysAgo?: number
  shareGrams: boolean
  missRate: number
  overRate: number
  usesTeaspoon: boolean
}

const BOTS: BotSpec[] = [
  { nickname: 'Petr', baselineG: 24, targetG: 0, preset: 'medium', durationDays: 28, curve: 'decelerating', startedDaysAgo: 19, shareGrams: true, missRate: 0.03, overRate: 0.12, usesTeaspoon: true },
  { nickname: 'Jana', baselineG: 12, targetG: 0, preset: 'fast', durationDays: 14, curve: 'decelerating', startedDaysAgo: 17, shareGrams: false, missRate: 0.02, overRate: 0.06, usesTeaspoon: false },
  { nickname: 'Tomáš', baselineG: 40, targetG: 10, preset: 'slow', durationDays: 56, curve: 'decelerating', startedDaysAgo: 30, shareGrams: true, missRate: 0.08, overRate: 0.25, usesTeaspoon: false },
  { nickname: 'Lucie', baselineG: 8, targetG: 0, preset: 'very_slow', durationDays: 84, curve: 'linear', startedDaysAgo: 9, shareGrams: false, missRate: 0.05, overRate: 0.1, usesTeaspoon: true },
  { nickname: 'Marek', baselineG: 30, targetG: 0, preset: 'medium', durationDays: 28, curve: 'decelerating', startedDaysAgo: 12, pausedDaysAgo: 3, shareGrams: true, missRate: 0.1, overRate: 0.2, usesTeaspoon: false },
  { nickname: 'Bára', baselineG: 18, targetG: 0, preset: 'slow', durationDays: 56, curve: 'linear', startedDaysAgo: 37, shareGrams: false, missRate: 0, overRate: 0.04, usesTeaspoon: false },
]

const BOT_COMMENTS = [
  'Super, jen tak dál! 💪',
  'Drž se, zvládáš to skvěle.',
  'Zítra je nový den, jsme s tebou ❤️',
  'Dneska to byl těžký den i u mě. Spolu to dáme.',
  'Klobouk dolů 🎩',
  'Krásná série! 🔥',
  'Díky, že to poctivě zapisuješ.',
]

function seedState(): DemoState {
  const today = pragueToday()
  const state: DemoState = {
    version: 1,
    users: [],
    plans: [],
    pauses: [],
    doses: [],
    zeroDays: [],
    reactions: [],
    comments: [],
    sessionUserId: null,
  }
  BOTS.forEach((spec, i) => {
    const id = `demo-${slugifyNickname(spec.nickname)}`
    state.users.push({
      id,
      nickname: spec.nickname,
      slug: slugifyNickname(spec.nickname),
      pin: DEMO_PIN,
      shareGrams: spec.shareGrams,
      teaspoonGrams: spec.usesTeaspoon ? 2.5 : null,
      pricePerGram: 4,
      bot: { seed: 1000 + i * 7919, missRate: spec.missRate, overRate: spec.overRate, usesTeaspoon: spec.usesTeaspoon },
    })
    const startDate = addDays(today, -spec.startedDaysAgo)
    const planId = `plan-${id}`
    state.plans.push({
      id: planId,
      userId: id,
      baselineG: spec.baselineG,
      targetG: spec.targetG,
      durationDays: spec.durationDays,
      curve: spec.curve,
      preset: spec.preset,
      startDate,
      endedOn: null,
      status: 'active',
      createdAt: `${startDate}T08:00:00Z`,
    })
    if (spec.pausedDaysAgo !== undefined) {
      state.pauses.push({ id: uid(), planId, startDate: addDays(today, -spec.pausedDaysAgo), endDate: null })
    }
  })

  // Some encouragement among the friends over the last few days.
  const rand = rng(hash(today))
  const bots = state.users
  for (let back = 1; back <= 6; back++) {
    const date = addDays(today, -back)
    for (const target of bots) {
      for (const from of bots) {
        if (from.id === target.id || rand() > 0.22) continue
        const emoji = REACTION_EMOJIS[Math.floor(rand() * REACTION_EMOJIS.length)]
        state.reactions.push({ id: uid(), fromUser: from.id, targetUser: target.id, date, emoji })
      }
      if (rand() < 0.18) {
        const author = bots[Math.floor(rand() * bots.length)]
        if (author.id !== target.id) {
          state.comments.push({
            id: uid(),
            authorId: author.id,
            targetUser: target.id,
            date,
            body: BOT_COMMENTS[Math.floor(rand() * BOT_COMMENTS.length)],
            createdAt: pragueLocalToInstant(addDays(date, 1), '09:15').toISOString(),
          })
        }
      }
    }
  }
  return state
}

// ---------------------------------------------------------------------------
// Simulated friend activity
// ---------------------------------------------------------------------------

const SLOTS = ['07:40', '10:30', '13:15', '16:45', '20:10']

function botDoses(user: DemoUser, date: ISODate, limitG: number, now: Date): { doses: DemoDose[]; zeroDay: boolean } {
  const bot = user.bot!
  const rand = rng(bot.seed ^ hash(date))
  const isToday = date === pragueDate(now)
  const roll = rand()
  if (roll < bot.missRate) return { doses: [], zeroDay: false }

  let total: number
  if (roll < bot.missRate + bot.overRate) {
    total = limitG + Math.max(1, Math.round(limitG * (0.1 + rand() * 0.3) * 2) / 2)
  } else if (limitG === 0) {
    total = 0
  } else {
    total = Math.max(0.5, Math.round(limitG * (0.72 + rand() * 0.28) * 2) / 2)
  }
  if (total === 0) {
    return { doses: [], zeroDay: !isToday || now.getTime() >= pragueLocalToInstant(date, '20:00').getTime() }
  }

  const count = Math.min(SLOTS.length, total <= 3 ? 1 : total <= 10 ? 2 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 2))
  const slots = SLOTS.slice(0, count + 1).sort(() => rand() - 0.5).slice(0, count).sort()
  const doses: DemoDose[] = []
  let left = total
  slots.forEach((slot, i) => {
    const grams = i === count - 1 ? left : Math.round((total / count) * (0.8 + rand() * 0.4) * 2) / 2
    left = round2(left - grams)
    const takenAt = pragueLocalToInstant(date, slot)
    if (grams <= 0 || takenAt > now) return
    const tsp = bot.usesTeaspoon && user.teaspoonGrams
    doses.push({
      id: `${user.id}-${date}-${i}`,
      userId: user.id,
      takenAt: takenAt.toISOString(),
      localDate: date,
      grams,
      inputUnit: tsp ? 'tsp' : 'g',
      inputAmount: tsp ? round2(grams / user.teaspoonGrams!) : grams,
      feeling: rand() < 0.7 ? 2 + Math.floor(rand() * 4) : null,
      note: null,
    })
  })
  return { doses, zeroDay: false }
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState
      if (parsed.version === 1) return parsed
    }
  } catch {
    // Corrupt or unavailable storage: start over.
  }
  return seedState()
}

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))

export function createDemoBackend(): Backend {
  let state = load()
  const listeners = new Set<(user: SessionUser | null) => void>()

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage full or blocked: keep working in memory.
    }
  }
  save()

  function sessionUser(): SessionUser | null {
    const u = state.users.find((x) => x.id === state.sessionUserId)
    return u ? { id: u.id, nickname: u.nickname } : null
  }

  function notify() {
    const user = sessionUser()
    listeners.forEach((l) => l(user))
  }

  function me(): DemoUser {
    const u = state.users.find((x) => x.id === state.sessionUserId)
    if (!u) throw new AppError('invalid_login', 'not_authenticated')
    return u
  }

  function userById(id: string): DemoUser {
    const u = state.users.find((x) => x.id === id)
    if (!u) throw new AppError('unknown', 'user_not_found')
    return u
  }

  function plansOf(userId: string) {
    return state.plans.filter((p) => p.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  function planDaysOf(userId: string): PlanDay[] {
    return plansOf(userId)
      .flatMap((p) => buildPlanDays(p, state.pauses.filter((x) => x.planId === p.id)))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /** Doses of a user from the first plan day until today. */
  function dosesOf(user: DemoUser, planDays: PlanDay[]): { doses: DemoDose[]; zeroDays: Set<ISODate> } {
    if (!user.bot) {
      return {
        doses: state.doses.filter((d) => d.userId === user.id),
        zeroDays: new Set(state.zeroDays.filter((z) => z.userId === user.id).map((z) => z.date)),
      }
    }
    const doses: DemoDose[] = []
    const zeroDays = new Set<ISODate>()
    if (!planDays.length) return { doses, zeroDays }
    const now = new Date()
    const today = pragueToday()
    let i = 0
    for (let d = planDays[0].date; d <= today; d = addDays(d, 1)) {
      while (i + 1 < planDays.length && planDays[i + 1].date <= d) i++
      const result = botDoses(user, d, planDays[i].limitG, now)
      doses.push(...result.doses)
      if (result.zeroDay) zeroDays.add(d)
    }
    return { doses, zeroDays }
  }

  function rowsOf(userId: string): DayRow[] {
    const user = userById(userId)
    const planDays = planDaysOf(userId)
    const { doses, zeroDays } = dosesOf(user, planDays)
    const activity = new Map<ISODate, DayActivity>()
    for (const d of doses) {
      const a = activity.get(d.localDate) ?? { totalCg: 0, doseCount: 0, zeroDay: false }
      a.totalCg += gramsToCg(d.grams)
      a.doseCount++
      activity.set(d.localDate, a)
    }
    for (const date of zeroDays) {
      const a = activity.get(date) ?? { totalCg: 0, doseCount: 0, zeroDay: false }
      a.zeroDay = true
      activity.set(date, a)
    }
    const baselines = new Map(plansOf(userId).map((p) => [p.id, p.baselineG]))
    return computeDays(planDays, baselines, activity, pragueToday())
  }

  function statsOf(userId: string) {
    const first = plansOf(userId)[0]
    return computeStats(rowsOf(userId), first?.baselineG ?? null, pragueToday())
  }

  function checkWindow(date: ISODate) {
    const today = pragueToday()
    if (date < addDays(today, -1) || date > today) throw new AppError('edit_window_closed')
  }

  function activePlan(userId: string) {
    return state.plans.find((p) => p.userId === userId && p.status === 'active') ?? null
  }

  /** Starts a new plan today, keeping the old one in history (mirrors private.retire_active_plan). */
  function addPlan(input: Omit<DemoPlan, 'id' | 'userId' | 'startDate' | 'endedOn' | 'status' | 'createdAt'>) {
    const user = me()
    const today = pragueToday()
    const old = activePlan(user.id)
    if (old) {
      if (old.startDate >= today) {
        state.plans = state.plans.filter((p) => p.id !== old.id)
        state.pauses = state.pauses.filter((p) => p.planId !== old.id)
      } else {
        state.pauses = state.pauses.filter((p) => !(p.planId === old.id && p.startDate >= today))
        for (const p of state.pauses) if (p.planId === old.id && p.endDate === null) p.endDate = addDays(today, -1)
        old.status = 'replaced'
        old.endedOn = today
      }
    }
    state.plans.push({
      id: uid(),
      userId: user.id,
      ...input,
      startDate: today,
      endedOn: null,
      status: 'active',
      createdAt: new Date().toISOString(),
    })
    save()
  }

  function toDose(d: DemoDose): Dose {
    const { userId: _userId, ...dose } = d
    return dose
  }

  function doseFromInput(input: DoseInput) {
    if (input.takenAt.getTime() > Date.now() + 5 * 60000) throw new AppError('edit_window_closed')
    const localDate = pragueDate(input.takenAt)
    checkWindow(localDate)
    if (!(input.grams > 0 && input.grams <= 200)) throw new AppError('unknown', 'invalid_grams')
    return {
      takenAt: input.takenAt.toISOString(),
      localDate,
      grams: round2(input.grams),
      inputUnit: input.inputUnit,
      inputAmount: round2(input.inputAmount),
      feeling: input.feeling,
      note: input.note?.slice(0, 140) || null,
    }
  }

  return {
    mode: 'demo',

    async getSession() {
      return sessionUser()
    },

    onAuthChange(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },

    async isNicknameAvailable(nickname) {
      await delay(60)
      const slug = slugifyNickname(nickname)
      return !state.users.some((u) => u.slug === slug)
    },

    async register(nickname, pin) {
      await delay()
      const slug = slugifyNickname(nickname)
      if (state.users.some((u) => u.slug === slug)) throw new AppError('nickname_taken')
      const user: DemoUser = {
        id: uid(),
        nickname: nickname.trim(),
        slug,
        pin,
        shareGrams: false,
        teaspoonGrams: null,
        pricePerGram: null,
        bot: null,
      }
      state.users.push(user)
      state.comments.push({
        id: uid(),
        authorId: 'demo-jana',
        targetUser: user.id,
        date: pragueToday(),
        body: 'Vítej v partě! Jsme tu jeden pro druhého 💚',
        createdAt: new Date().toISOString(),
      })
      state.sessionUserId = user.id
      save()
      notify()
    },

    async login(nickname, pin) {
      await delay()
      const user = state.users.find((u) => u.slug === slugifyNickname(nickname))
      if (!user || user.pin !== pin) throw new AppError('invalid_login')
      if (user.bot) {
        // Logging in as a simulated friend: freeze their history into stored data
        // so it can be edited like any other account from now on.
        const generated = dosesOf(user, planDaysOf(user.id))
        state.doses.push(...generated.doses)
        for (const date of generated.zeroDays) state.zeroDays.push({ userId: user.id, date })
        user.bot = null
      }
      state.sessionUserId = user.id
      save()
      notify()
    },

    async logout() {
      state.sessionUserId = null
      save()
      notify()
    },

    async getMySettings() {
      await delay(60)
      const u = me()
      return {
        nickname: u.nickname,
        shareGrams: u.shareGrams,
        teaspoonGrams: u.teaspoonGrams,
        pricePerGram: u.pricePerGram,
        reminderHour: u.reminderHour ?? null,
        notifySocial: u.notifySocial ?? false,
      }
    },

    async updateSettings(patch) {
      await delay()
      const u = me()
      if (patch.shareGrams !== undefined) u.shareGrams = patch.shareGrams
      if (patch.teaspoonGrams !== undefined) u.teaspoonGrams = patch.teaspoonGrams
      if (patch.pricePerGram !== undefined) u.pricePerGram = patch.pricePerGram
      if (patch.reminderHour !== undefined) u.reminderHour = patch.reminderHour
      if (patch.notifySocial !== undefined) u.notifySocial = patch.notifySocial
      save()
    },

    // Demo mode has no server that could send notifications.
    async savePushSubscription() {
      throw new AppError('unknown', 'push_not_in_demo')
    },

    async deletePushSubscription() {},

    async getActivePlan(): Promise<ActivePlan | null> {
      await delay(60)
      const plan = activePlan(me().id)
      if (!plan) return null
      const pauses = state.pauses.filter((p) => p.planId === plan.id)
      const days = buildPlanDays(plan, pauses)
      const open = pauses.find((p) => p.endDate === null)
      return {
        id: plan.id,
        baselineG: plan.baselineG,
        targetG: plan.targetG,
        startDate: plan.startDate,
        durationDays: plan.durationDays,
        curve: plan.curve,
        preset: plan.preset,
        isPaused: !!open,
        pauseStart: open?.startDate ?? null,
        endDate: open ? null : (days[days.length - 1]?.date ?? null),
        days,
      }
    },

    async createPlan(input) {
      await delay()
      addPlan({ ...input, customLimits: null })
    },

    async createCustomPlan(limits) {
      await delay()
      addPlan({ ...customPlanParams(limits), preset: 'custom' })
    },

    async pausePlan() {
      await delay()
      const plan = activePlan(me().id)
      if (!plan) throw new AppError('unknown', 'no_active_plan')
      const pauses = state.pauses.filter((p) => p.planId === plan.id)
      if (pauses.some((p) => p.endDate === null)) throw new AppError('already_paused')
      const days = buildPlanDays(plan, pauses)
      if (pragueToday() >= days[days.length - 1].date) throw new AppError('plan_finished')
      state.pauses.push({ id: uid(), planId: plan.id, startDate: pragueToday(), endDate: null })
      save()
    },

    async resumePlan() {
      await delay()
      const plan = activePlan(me().id)
      const open = plan && state.pauses.find((p) => p.planId === plan.id && p.endDate === null)
      if (!open) throw new AppError('unknown', 'not_paused')
      const today = pragueToday()
      if (open.startDate >= today) state.pauses = state.pauses.filter((p) => p !== open)
      else open.endDate = addDays(today, -1)
      save()
    },

    async listMyDoses(from, to) {
      await delay(60)
      const user = me()
      return dosesOf(user, planDaysOf(user.id))
        .doses.filter((d) => d.localDate >= from && d.localDate <= to)
        .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
        .map(toDose)
    },

    async addDose(input) {
      await delay()
      const user = me()
      const dose = doseFromInput(input)
      state.doses.push({ id: uid(), userId: user.id, ...dose })
      state.zeroDays = state.zeroDays.filter((z) => !(z.userId === user.id && z.date === dose.localDate))
      save()
    },

    async updateDose(id, input) {
      await delay()
      const user = me()
      const existing = state.doses.find((d) => d.id === id && d.userId === user.id)
      if (!existing) throw new AppError('unknown', 'dose_not_found')
      checkWindow(existing.localDate)
      Object.assign(existing, doseFromInput(input))
      state.zeroDays = state.zeroDays.filter((z) => !(z.userId === user.id && z.date === existing.localDate))
      save()
    },

    async deleteDose(id) {
      await delay()
      const user = me()
      const existing = state.doses.find((d) => d.id === id && d.userId === user.id)
      if (!existing) throw new AppError('unknown', 'dose_not_found')
      checkWindow(existing.localDate)
      state.doses = state.doses.filter((d) => d !== existing)
      save()
    },

    async setZeroDay(date, on) {
      await delay()
      const user = me()
      checkWindow(date)
      state.zeroDays = state.zeroDays.filter((z) => !(z.userId === user.id && z.date === date))
      if (on) {
        if (state.doses.some((d) => d.userId === user.id && d.localDate === date)) throw new AppError('doses_exist')
        state.zeroDays.push({ userId: user.id, date })
      }
      save()
    },

    async getUserDays(userId, from, to): Promise<DayResult[]> {
      await delay(60)
      const viewer = me()
      const show = userId === viewer.id || userById(userId).shareGrams
      return rowsOf(userId)
        .filter((r) => r.date >= from && r.date <= to)
        .map((r) => ({
          date: r.date,
          status: r.status,
          points: r.points,
          streakAfter: r.streakAfter,
          isFinal: r.isFinal,
          isPaused: r.isPaused,
          zeroDay: r.zeroDay,
          logged: r.logged,
          limitG: show ? r.limitG : null,
          totalG: show ? r.totalG : null,
          baselineG: show ? r.baselineG : null,
          planPct: Math.round((1000 * r.limitG) / r.baselineG) / 10,
          actualPct: r.logged ? Math.round((1000 * r.totalG) / r.baselineG) / 10 : null,
        }))
    },

    async getUserStats(userId) {
      await delay(60)
      const viewer = me()
      const stats = statsOf(userId)
      const show = userId === viewer.id || userById(userId).shareGrams
      return { ...stats, currentLimitG: show ? stats.currentLimitG : null }
    },

    async getLeaderboard() {
      await delay()
      const viewer = me()
      return state.users.map((u) => {
        const stats = statsOf(u.id)
        return {
          ...stats,
          currentLimitG: u.id === viewer.id || u.shareGrams ? stats.currentLimitG : null,
          userId: u.id,
          nickname: u.nickname,
        }
      })
    },

    async getGroupSummary() {
      await delay(60)
      me()
      const today = pragueToday()
      const yesterday = addDays(today, -1)
      const summary = {
        today: { participants: 0, met: 0, over: 0, pending: 0 },
        yesterday: { participants: 0, met: 0, over: 0, missed: 0 },
      }
      for (const u of state.users) {
        const rows = rowsOf(u.id)
        const t = rows.find((r) => r.date === today)
        const y = rows.find((r) => r.date === yesterday)
        if (t) {
          summary.today.participants++
          if (t.status === 'met' || t.status === 'over' || t.status === 'pending') summary.today[t.status]++
        }
        if (y) {
          summary.yesterday.participants++
          if (y.status === 'met' || y.status === 'over' || y.status === 'missed') summary.yesterday[y.status]++
        }
      }
      return summary
    },

    async getFeed(limit) {
      await delay(60)
      me()
      const events: FeedEvent[] = []
      for (const u of state.users) {
        const plans = plansOf(u.id)
        for (const p of plans) {
          events.push({
            id: `start-${p.id}`,
            userId: u.id,
            nickname: u.nickname,
            type: 'plan_started',
            eventDate: p.startDate,
            payload: { preset: p.preset, duration_days: p.durationDays },
          })
        }
        if (!plans.length) continue
        const targets = new Map(plans.map((p) => [p.id, p.targetG]))
        deriveDayEvents(rowsOf(u.id), plans[0].baselineG, targets).forEach((e, i) =>
          events.push({ id: `${u.id}-${i}`, userId: u.id, nickname: u.nickname, ...e }),
        )
      }
      return events.sort((a, b) => b.eventDate.localeCompare(a.eventDate)).slice(0, limit)
    },

    async getProfile(userId) {
      await delay(60)
      me()
      const u = state.users.find((x) => x.id === userId)
      return u ? { userId: u.id, nickname: u.nickname, shareGrams: u.shareGrams } : null
    },

    async getDaySocial(userId, date) {
      await delay(60)
      const viewer = me()
      const name = (id: string) => state.users.find((u) => u.id === id)?.nickname ?? '?'
      const reactions = state.reactions.filter((r) => r.targetUser === userId && r.date === date)
      return {
        reactions: REACTION_EMOJIS.map((emoji) => {
          const list = reactions.filter((r) => r.emoji === emoji)
          return {
            emoji,
            count: list.length,
            mine: list.some((r) => r.fromUser === viewer.id),
            names: list.map((r) => name(r.fromUser)),
          }
        }),
        comments: state.comments
          .filter((c) => c.targetUser === userId && c.date === date)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((c) => ({
            id: c.id,
            authorId: c.authorId,
            authorNickname: name(c.authorId),
            body: c.body,
            createdAt: c.createdAt,
          })),
      }
    },

    async toggleReaction(userId, date, emoji) {
      await delay(60)
      const viewer = me()
      if (userId === viewer.id) throw new AppError('unknown', 'own_day')
      const existing = state.reactions.find(
        (r) => r.fromUser === viewer.id && r.targetUser === userId && r.date === date && r.emoji === emoji,
      )
      if (existing) state.reactions = state.reactions.filter((r) => r !== existing)
      else state.reactions.push({ id: uid(), fromUser: viewer.id, targetUser: userId, date, emoji })
      save()
    },

    async addComment(userId, date, body) {
      await delay()
      const viewer = me()
      const text = body.trim()
      if (!text || text.length > 280) throw new AppError('unknown', 'invalid_comment')
      state.comments.push({
        id: uid(),
        authorId: viewer.id,
        targetUser: userId,
        date,
        body: text,
        createdAt: new Date().toISOString(),
      })
      save()
    },

    async deleteComment(id) {
      await delay()
      const viewer = me()
      const c = state.comments.find((x) => x.id === id)
      if (!c || (c.authorId !== viewer.id && c.targetUser !== viewer.id)) throw new AppError('unknown', 'not_allowed')
      state.comments = state.comments.filter((x) => x !== c)
      save()
    },
  }
}

/** Wipes demo data (used by the "reset demo" button). */
export function resetDemoData() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
