import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { backend } from '../api'
import { pragueToday, type ISODate } from '../lib/time'

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
