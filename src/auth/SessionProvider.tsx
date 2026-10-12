import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { backend, type SessionUser } from '../api'

interface SessionState {
  user: SessionUser | null
  loading: boolean
}

const SessionContext = createContext<SessionState>({ user: null, loading: true })

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<SessionState>({ user: null, loading: true })

  useEffect(() => {
    let active = true
    backend
      .getSession()
      .then((user) => active && setState({ user, loading: false }))
      .catch(() => active && setState({ user: null, loading: false }))
    const unsubscribe = backend.onAuthChange((user) => {
      setState((prev) => {
        // A different user (or logout) must never see cached data of the previous one.
        if (prev.user?.id !== user?.id) queryClient.clear()
        return { user, loading: false }
      })
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [queryClient])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}

/** The logged-in user; only use inside routes guarded by RequireAuth. */
export function useMe(): SessionUser {
  const { user } = useSession()
  if (!user) throw new Error('useMe outside of an authenticated route')
  return user
}
