import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { backend } from '../api'
import { computeIntakeStats } from '../lib/intakeStats'
import type { IntakeSubstance } from '../lib/substances'
import { pragueToday, type ISODate } from '../lib/time'

/** Start of "all history" queries. */
export const ALL_FROM: ISODate = '2000-01-01'

export const keys = {
  settings: ['settings'] as const,
  plan: ['plan'] as const,
  doses: (from: ISODate, to: ISODate) => ['doses', from, to] as const,
  days: (userId: string, from: ISODate, to: ISODate) => ['days', userId, from, to] as const,
  stats: (userId: string) => ['stats', userId] as const,
  leaderboard: ['leaderboard'] as const,
  group: ['group'] as const,
  groupToday: ['group', 'today'] as const,
  feed: ['feed'] as const,
  profile: (userId: string) => ['profile', userId] as const,
  social: (userId: string, date: ISODate) => ['social', userId, date] as const,
  intakes: (kinds: readonly IntakeSubstance[], from: ISODate, to: ISODate) => ['intakes', kinds.join('+'), from, to] as const,
  presets: (substance: IntakeSubstance) => ['presets', substance] as const,
}

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => backend.getMySettings() })

export const useActivePlan = () => useQuery({ queryKey: keys.plan, queryFn: () => backend.getActivePlan() })

export const useMyDoses = (from: ISODate, to: ISODate) =>
  useQuery({ queryKey: keys.doses(from, to), queryFn: () => backend.listMyDoses(from, to) })

export const useUserDays = (userId: string, from: ISODate, to: ISODate) =>
  useQuery({ queryKey: keys.days(userId, from, to), queryFn: () => backend.getUserDays(userId, from, to) })

export const useUserStats = (userId: string) =>
  useQuery({ queryKey: keys.stats(userId), queryFn: () => backend.getUserStats(userId) })

export const useLeaderboard = () => useQuery({ queryKey: keys.leaderboard, queryFn: () => backend.getLeaderboard() })

export const useGroupSummary = () => useQuery({ queryKey: keys.group, queryFn: () => backend.getGroupSummary() })

export const useGroupToday = () => useQuery({ queryKey: keys.groupToday, queryFn: () => backend.getGroupToday() })

export const useFeed = (enabled = true) =>
  useQuery({ queryKey: keys.feed, queryFn: () => backend.getFeed(40), enabled })

export const useProfile = (userId: string) =>
  useQuery({ queryKey: keys.profile(userId), queryFn: () => backend.getProfile(userId) })

export const useDaySocial = (userId: string, date: ISODate) =>
  useQuery({ queryKey: keys.social(userId, date), queryFn: () => backend.getDaySocial(userId, date) })

export const useMyIntakes = (kinds: readonly IntakeSubstance[], from: ISODate, to: ISODate) =>
  useQuery({ queryKey: keys.intakes(kinds, from, to), queryFn: () => backend.listMyIntakes(kinds, from, to) })

export const useIntakePresets = (substance: IntakeSubstance) =>
  useQuery({ queryKey: keys.presets(substance), queryFn: () => backend.listPresets(substance) })

/** Statistics over all of the user's own entries of the given kinds together (src/lib/intakeStats.ts). */
export function useIntakeStats(kinds: readonly IntakeSubstance[], today: ISODate, now: Date) {
  const all = useMyIntakes(kinds, ALL_FROM, today)
  const stats = useMemo(() => (all.data ? computeIntakeStats(all.data, now) : undefined), [all.data, now])
  return { ...all, stats }
}

/** Refreshes everything that depends on entries of non-kratom substances. */
export function useRefreshIntakes() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['intakes'] })
}

/** Refreshes everything that depends on logged doses or the plan. */
export function useRefreshAfterChange() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      ['plan', 'doses', 'days', 'stats', 'leaderboard', 'group', 'feed'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    )
}

/** Current Prague date; re-renders when the day changes at midnight. */
export function useToday(): ISODate {
  const [today, setToday] = useState(pragueToday)
  useEffect(() => {
    const id = setInterval(() => setToday(pragueToday()), 30_000)
    return () => clearInterval(id)
  }, [])
  return today
}

/** Current time, refreshed every `everyMs` (for live "time since" displays). */
export function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
