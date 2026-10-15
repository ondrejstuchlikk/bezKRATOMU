import type { FeedEventType } from '../lib/days'
import type { Curve, PlanDay, Preset } from '../lib/plan'
import type { DayStatus } from '../lib/scoring'
import type { ISODate } from '../lib/time'
import type { PushKeys } from '../lib/push'
import type { InputUnit } from '../lib/units'

export type { DayStatus, FeedEventType }

export interface SessionUser {
  id: string
  nickname: string
}

export interface MySettings {
  nickname: string
  shareGrams: boolean
  teaspoonGrams: number | null
  pricePerGram: number | null
  /** Prague hour of the evening reminder, null = off (applies to all devices). */
  reminderHour: number | null
  /** Notify about reactions and comments on my days. */
  notifySocial: boolean
}

export interface ActivePlan {
  id: string
  baselineG: number
  targetG: number
  startDate: ISODate
  durationDays: number
  curve: Curve
  preset: Preset
  isPaused: boolean
  pauseStart: ISODate | null
  /** Day on which the target is reached (moves while paused). */
  endDate: ISODate | null
  days: PlanDay[]
}

export interface NewPlan {
  baselineG: number
  targetG: number
  durationDays: number
  curve: Curve
  preset: Preset
}

export interface Dose {
  id: string
  takenAt: string
  localDate: ISODate
  grams: number
  inputUnit: InputUnit
  inputAmount: number
  feeling: number | null
  note: string | null
}

export interface DoseInput {
  takenAt: Date
  grams: number
  inputUnit: InputUnit
  inputAmount: number
  feeling: number | null
  note: string | null
}

export interface DayResult {
  date: ISODate
  status: DayStatus
  points: number
  streakAfter: number
  isFinal: boolean
  isPaused: boolean
  zeroDay: boolean
  logged: boolean
  /** Grams are null for other users who don't share exact grams. */
  limitG: number | null
  totalG: number | null
  baselineG: number | null
  /** Limit as % of the plan baseline. */
  planPct: number
  /** Intake as % of the plan baseline (null when nothing was logged). */
  actualPct: number | null
}

export interface UserStats {
  totalPoints: number
  metDays: number
  scoredDays: number
  metPct: number | null
  currentStreak: number
  bestStreak: number
  reductionLimitPct: number | null
  reductionAvgPct: number | null
  todayStatus: DayStatus | 'none'
  currentLimitG: number | null
  hasPlan: boolean
  /** Latest dose that has already happened (ISO instant); only for yourself, null for others. */
  lastDoseAt: string | null
  /** Longest time between two doses in a row, in minutes (src/lib/gaps.ts). */
  recordGapMin: number | null
  /** The record is the gap still running since the latest dose. */
  recordGapRunning: boolean
  avgGap5dMin: number | null
  avgGapAllMin: number | null
}

export interface LeaderboardRow extends UserStats {
  userId: string
  nickname: string
}

export interface PublicProfile {
  userId: string
  nickname: string
  shareGrams: boolean
}

export interface GroupSummary {
  today: { participants: number; met: number; over: number; pending: number }
  yesterday: { participants: number; met: number; over: number; missed: number }
}

export interface GroupMemberToday {
  userId: string
  nickname: string
  status: DayStatus
  logged: boolean
  /** Today's intake as % of today's limit; null when nothing is logged, or something was taken on a 0 g limit. */
  pctOfLimit: number | null
  /** Grams are null for other users who don't share exact grams. */
  totalG: number | null
  limitG: number | null
}

export interface FeedEvent {
  id: string
  userId: string
  nickname: string
  type: FeedEventType
  eventDate: ISODate
  payload: Record<string, unknown>
}

// 👏 💪 ❤️ 🔥 – must match the CHECK constraint on public.reactions.
export const REACTION_EMOJIS = ['\u{1F44F}', '\u{1F4AA}', '❤️', '\u{1F525}'] as const
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

export interface ReactionSummary {
  emoji: ReactionEmoji
  count: number
  mine: boolean
  names: string[]
}

export interface DayComment {
  id: string
  authorId: string
  authorNickname: string
  body: string
  createdAt: string
}

export interface DaySocial {
  reactions: ReactionSummary[]
  comments: DayComment[]
}

/** Error codes the UI translates into friendly Czech messages. */
export type AppErrorCode =
  | 'nickname_taken'
  | 'invalid_login'
  | 'rate_limited'
  | 'network'
  | 'edit_window_closed'
  | 'doses_exist'
  | 'already_paused'
  | 'plan_finished'
  | 'unknown'

export class AppError extends Error {
  readonly code: AppErrorCode
  constructor(code: AppErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

export interface Backend {
  readonly mode: 'demo' | 'supabase'

  getSession(): Promise<SessionUser | null>
  onAuthChange(callback: (user: SessionUser | null) => void): () => void
  isNicknameAvailable(nickname: string): Promise<boolean>
  register(nickname: string, pin: string): Promise<void>
  login(nickname: string, pin: string): Promise<void>
  logout(): Promise<void>

  getMySettings(): Promise<MySettings>
  updateSettings(patch: Partial<Omit<MySettings, 'nickname'>>): Promise<void>

  /** Web push for this device (not available in demo mode). */
  savePushSubscription(keys: PushKeys): Promise<void>
  deletePushSubscription(endpoint: string): Promise<void>

  getActivePlan(): Promise<ActivePlan | null>
  createPlan(plan: NewPlan): Promise<void>
  /** Hand-made plan starting today: limits[0] is today's limit, limits[1] tomorrow's, … */
  createCustomPlan(limits: number[]): Promise<void>
  pausePlan(): Promise<void>
  resumePlan(): Promise<void>

  listMyDoses(from: ISODate, to: ISODate): Promise<Dose[]>
  addDose(input: DoseInput): Promise<void>
  updateDose(id: string, input: DoseInput): Promise<void>
  deleteDose(id: string): Promise<void>
  setZeroDay(date: ISODate, on: boolean): Promise<void>

  getUserDays(userId: string, from: ISODate, to: ISODate): Promise<DayResult[]>
  getUserStats(userId: string): Promise<UserStats>
  getLeaderboard(): Promise<LeaderboardRow[]>
  getGroupSummary(): Promise<GroupSummary>
  getGroupToday(): Promise<GroupMemberToday[]>
  getFeed(limit: number): Promise<FeedEvent[]>
  getProfile(userId: string): Promise<PublicProfile | null>

  getDaySocial(userId: string, date: ISODate): Promise<DaySocial>
  toggleReaction(userId: string, date: ISODate, emoji: ReactionEmoji): Promise<void>
  addComment(userId: string, date: ISODate, body: string): Promise<void>
  deleteComment(id: string): Promise<void>
}
