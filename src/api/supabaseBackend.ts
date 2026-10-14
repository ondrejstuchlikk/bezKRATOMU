import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Curve, Preset } from '../lib/plan'
import type { ISODate } from '../lib/time'
import type { InputUnit } from '../lib/units'
import { nicknameToEmail } from '../lib/nickname'
import {
  AppError,
  REACTION_EMOJIS,
  type Backend,
  type DayComment,
  type DayResult,
  type DayStatus,
  type Dose,
  type DoseInput,
  type FeedEvent,
  type FeedEventType,
  type GroupMemberToday,
  type ReactionEmoji,
  type SessionUser,
  type UserStats,
} from './types'

interface ErrorLike {
  message?: string
  code?: string
  status?: number
  name?: string
}

const SERVER_CODES = ['already_paused', 'plan_finished', 'doses_exist', 'not_paused', 'no_active_plan'] as const

function toAppError(error: ErrorLike): AppError {
  const message = error.message ?? ''
  if (error.status === 429 || error.code === 'over_request_rate_limit') return new AppError('rate_limited', message)
  if (error.code === 'invalid_credentials') return new AppError('invalid_login', message)
  if (error.code === 'user_already_exists' || /already registered|saving new user/i.test(message)) {
    return new AppError('nickname_taken', message)
  }
  if (error.code === '42501') return new AppError('edit_window_closed', message)
  for (const code of SERVER_CODES) {
    if (message.includes(code)) {
      return new AppError(code === 'not_paused' || code === 'no_active_plan' ? 'unknown' : code, message)
    }
  }
  if (/failed to fetch|network|load failed/i.test(message) || error.name === 'AuthRetryableFetchError') {
    return new AppError('network', message)
  }
  return new AppError('unknown', message)
}

function check<T>(result: { data: T; error: ErrorLike | null }): T {
  if (result.error) throw toAppError(result.error)
  return result.data
}

function toSessionUser(session: Session | null): SessionUser | null {
  if (!session) return null
  const nickname = (session.user.user_metadata?.nickname as string | undefined) ?? ''
  return { id: session.user.id, nickname }
}

type Row = Record<string, unknown>
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function mapDose(r: Row): Dose {
  return {
    id: r.id as string,
    takenAt: r.taken_at as string,
    localDate: r.local_date as ISODate,
    grams: Number(r.grams),
    inputUnit: r.input_unit as InputUnit,
    inputAmount: Number(r.input_amount),
    feeling: num(r.feeling),
    note: (r.note as string | null) ?? null,
  }
}

function mapDay(r: Row): DayResult {
  return {
    date: r.date as ISODate,
    status: r.status as DayStatus,
    points: Number(r.points),
    streakAfter: Number(r.streak_after),
    isFinal: Boolean(r.is_final),
    isPaused: Boolean(r.is_paused),
    zeroDay: Boolean(r.zero_day),
    logged: Boolean(r.logged),
    limitG: num(r.limit_g),
    totalG: num(r.total_g),
    baselineG: num(r.baseline_g),
    planPct: Number(r.plan_pct),
    actualPct: num(r.actual_pct),
  }
}

function mapStats(r: Row): UserStats {
  return {
    totalPoints: Number(r.total_points),
    metDays: Number(r.met_days),
    scoredDays: Number(r.scored_days),
    metPct: num(r.met_pct),
    currentStreak: Number(r.current_streak),
    bestStreak: Number(r.best_streak),
    reductionLimitPct: num(r.reduction_limit_pct),
    reductionAvgPct: num(r.reduction_avg_pct),
    todayStatus: r.today_status as UserStats['todayStatus'],
    currentLimitG: num(r.current_limit_g),
    hasPlan: Boolean(r.has_plan),
  }
}

function doseRow(input: DoseInput) {
  return {
    taken_at: input.takenAt.toISOString(),
    grams: input.grams,
    input_unit: input.inputUnit,
    input_amount: input.inputAmount,
    feeling: input.feeling,
    note: input.note,
  }
}

const relationName = (v: unknown) => {
  const rel = Array.isArray(v) ? v[0] : v
  return ((rel as Row | null)?.nickname as string | undefined) ?? '?'
}

export function createSupabaseBackend(sb: SupabaseClient): Backend {
  async function uid(): Promise<string> {
    const { data } = await sb.auth.getSession()
    if (!data.session) throw new AppError('invalid_login', 'not_authenticated')
    return data.session.user.id
  }

  return {
    mode: 'supabase',

    async getSession() {
      const { data } = await sb.auth.getSession()
      return toSessionUser(data.session)
    },

    onAuthChange(callback) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => callback(toSessionUser(session)))
      return () => data.subscription.unsubscribe()
    },

    async isNicknameAvailable(nickname) {
      return check(await sb.rpc('is_nickname_available', { p_nickname: nickname })) as boolean
    },

    async register(nickname, pin) {
      const { error } = await sb.auth.signUp({
        email: nicknameToEmail(nickname),
        password: pin,
        options: { data: { nickname: nickname.trim() } },
      })
      if (error) throw toAppError(error)
    },

    async login(nickname, pin) {
      const { error } = await sb.auth.signInWithPassword({ email: nicknameToEmail(nickname), password: pin })
      if (error) throw toAppError(error)
    },

    async logout() {
      const { error } = await sb.auth.signOut()
      if (error) throw toAppError(error)
    },

    async getMySettings() {
      const id = await uid()
      const profile = check(await sb.from('profiles').select('nickname, share_grams').eq('id', id).single()) as Row
      const settings = check(
        await sb
          .from('user_settings')
          .select('teaspoon_grams, price_per_gram, reminder_hour, notify_social')
          .eq('user_id', id)
          .single(),
      ) as Row
      return {
        nickname: profile.nickname as string,
        shareGrams: Boolean(profile.share_grams),
        teaspoonGrams: num(settings.teaspoon_grams),
        pricePerGram: num(settings.price_per_gram),
        reminderHour: num(settings.reminder_hour),
        notifySocial: Boolean(settings.notify_social),
      }
    },

    async updateSettings(patch) {
      const id = await uid()
      if (patch.shareGrams !== undefined) {
        check(await sb.from('profiles').update({ share_grams: patch.shareGrams }).eq('id', id))
      }
      const settings: Row = {}
      if (patch.teaspoonGrams !== undefined) settings.teaspoon_grams = patch.teaspoonGrams
      if (patch.pricePerGram !== undefined) settings.price_per_gram = patch.pricePerGram
      if (patch.reminderHour !== undefined) settings.reminder_hour = patch.reminderHour
      if (patch.notifySocial !== undefined) settings.notify_social = patch.notifySocial
      if (Object.keys(settings).length) {
        settings.updated_at = new Date().toISOString()
        check(await sb.from('user_settings').update(settings).eq('user_id', id))
      }
    },

    async savePushSubscription(keys) {
      check(await sb.rpc('save_push_subscription', { p_endpoint: keys.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth }))
    },

    async deletePushSubscription(endpoint) {
      check(await sb.rpc('delete_push_subscription', { p_endpoint: endpoint }))
    },

    async getActivePlan() {
      const id = await uid()
      const plan = check(
        await sb.from('plans').select('*').eq('user_id', id).eq('status', 'active').maybeSingle(),
      ) as Row | null
      if (!plan) return null
      const pauses = check(await sb.from('pauses').select('start_date, end_date').eq('plan_id', plan.id)) as Row[]
      const days = check(
        await sb.from('plan_days').select('date, plan_id, limit_g, is_paused').eq('plan_id', plan.id).order('date'),
      ) as Row[]
      const open = pauses.find((p) => p.end_date === null)
      const lastDay = days[days.length - 1]
      return {
        id: plan.id as string,
        baselineG: Number(plan.baseline_g),
        targetG: Number(plan.target_g),
        startDate: plan.start_date as ISODate,
        durationDays: Number(plan.duration_days),
        curve: plan.curve as Curve,
        preset: plan.preset as Preset,
        isPaused: !!open,
        pauseStart: (open?.start_date as ISODate | undefined) ?? null,
        endDate: open || !lastDay ? null : (lastDay.date as ISODate),
        days: days.map((d) => ({
          date: d.date as ISODate,
          planId: d.plan_id as string,
          limitG: Number(d.limit_g),
          isPaused: Boolean(d.is_paused),
        })),
      }
    },

    async createPlan(plan) {
      check(
        await sb.rpc('create_plan', {
          p_baseline: plan.baselineG,
          p_target: plan.targetG,
          p_duration: plan.durationDays,
          p_curve: plan.curve,
          p_preset: plan.preset,
        }),
      )
    },

    async createCustomPlan(limits) {
      check(await sb.rpc('create_custom_plan', { p_limits: limits }))
    },

    async pausePlan() {
      check(await sb.rpc('pause_plan'))
    },

    async resumePlan() {
      check(await sb.rpc('resume_plan'))
    },

    async listMyDoses(from, to) {
      const id = await uid()
      const rows = check(
        await sb
          .from('doses')
          .select('*')
          .eq('user_id', id)
          .gte('local_date', from)
          .lte('local_date', to)
          .order('taken_at'),
      ) as Row[]
      return rows.map(mapDose)
    },

    async addDose(input) {
      check(await sb.from('doses').insert(doseRow(input)))
    },

    async updateDose(id, input) {
      const rows = check(await sb.from('doses').update(doseRow(input)).eq('id', id).select('id')) as Row[]
      if (!rows.length) throw new AppError('edit_window_closed')
    },

    async deleteDose(id) {
      const rows = check(await sb.from('doses').delete().eq('id', id).select('id')) as Row[]
      if (!rows.length) throw new AppError('edit_window_closed')
    },

    async setZeroDay(date, on) {
      if (on) {
        check(await sb.from('zero_days').insert({ date }))
      } else {
        const id = await uid()
        check(await sb.from('zero_days').delete().eq('user_id', id).eq('date', date))
      }
    },

    async getUserDays(userId, from, to) {
      const rows = check(await sb.rpc('get_user_days', { p_user: userId, p_from: from, p_to: to })) as Row[]
      return rows.map(mapDay)
    },

    async getUserStats(userId) {
      const rows = check(await sb.rpc('get_user_stats', { p_user: userId })) as Row[]
      if (!rows.length) throw new AppError('unknown', 'user_not_found')
      return mapStats(rows[0])
    },

    async getLeaderboard() {
      const rows = check(await sb.rpc('get_leaderboard')) as Row[]
      return rows.map((r) => ({ ...mapStats(r), userId: r.user_id as string, nickname: r.nickname as string }))
    },

    async getGroupSummary() {
      return check(await sb.rpc('get_group_summary'))
    },

    async getGroupToday() {
      const rows = check(await sb.rpc('get_group_today')) as Row[]
      return rows.map(
        (r): GroupMemberToday => ({
          userId: r.user_id as string,
          nickname: r.nickname as string,
          status: r.status as DayStatus,
          logged: Boolean(r.logged),
          pctOfLimit: num(r.pct_of_limit),
          totalG: num(r.total_g),
          limitG: num(r.limit_g),
        }),
      )
    },

    async getFeed(limit) {
      const rows = check(
        await sb
          .from('feed_events')
          .select('id, user_id, type, event_date, payload, profiles(nickname)')
          .order('event_date', { ascending: false })
          .order('id', { ascending: false })
          .limit(limit),
      ) as Row[]
      return rows.map(
        (r): FeedEvent => ({
          id: String(r.id),
          userId: r.user_id as string,
          nickname: relationName(r.profiles),
          type: r.type as FeedEventType,
          eventDate: r.event_date as ISODate,
          payload: (r.payload as Record<string, unknown>) ?? {},
        }),
      )
    },

    async getProfile(userId) {
      const r = check(
        await sb.from('profiles').select('id, nickname, share_grams').eq('id', userId).maybeSingle(),
      ) as Row | null
      return r ? { userId: r.id as string, nickname: r.nickname as string, shareGrams: Boolean(r.share_grams) } : null
    },

    async getDaySocial(userId, date) {
      const me = await uid()
      const reactions = check(
        await sb
          .from('reactions')
          .select('emoji, from_user, profiles!reactions_from_user_fkey(nickname)')
          .eq('target_user', userId)
          .eq('date', date),
      ) as Row[]
      const comments = check(
        await sb
          .from('comments')
          .select('id, author_id, body, created_at, profiles!comments_author_id_fkey(nickname)')
          .eq('target_user', userId)
          .eq('date', date)
          .order('created_at'),
      ) as Row[]
      return {
        reactions: REACTION_EMOJIS.map((emoji) => {
          const mine = reactions.filter((r) => r.emoji === emoji)
          return {
            emoji,
            count: mine.length,
            mine: mine.some((r) => r.from_user === me),
            names: mine.map((r) => relationName(r.profiles)),
          }
        }),
        comments: comments.map(
          (c): DayComment => ({
            id: c.id as string,
            authorId: c.author_id as string,
            authorNickname: relationName(c.profiles),
            body: c.body as string,
            createdAt: c.created_at as string,
          }),
        ),
      }
    },

    async toggleReaction(userId, date, emoji: ReactionEmoji) {
      const me = await uid()
      const existing = check(
        await sb
          .from('reactions')
          .select('id')
          .eq('from_user', me)
          .eq('target_user', userId)
          .eq('date', date)
          .eq('emoji', emoji),
      ) as Row[]
      if (existing.length) {
        check(await sb.from('reactions').delete().eq('id', existing[0].id))
      } else {
        check(await sb.from('reactions').insert({ target_user: userId, date, emoji }))
      }
    },

    async addComment(userId, date, body) {
      check(await sb.from('comments').insert({ target_user: userId, date, body }))
    },

    async deleteComment(id) {
      const rows = check(await sb.from('comments').delete().eq('id', id).select('id')) as Row[]
      if (!rows.length) throw new AppError('unknown', 'comment_not_deleted')
    },
  }
}
