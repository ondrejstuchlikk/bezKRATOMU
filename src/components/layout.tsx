import type { ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { backend } from '../api'
import { useSession } from '../auth/SessionProvider'
import { useActivePlan, useOnline } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { ChartIcon, GroupIcon, SettingsIcon, TodayIcon } from './icons'
import { cx, ErrorState, Loading } from './ui'

const ACK_KEY = 'safetyAck'

export function hasSafetyAck(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) === '1'
  } catch {
    return false
  }
}

export function setSafetyAck() {
  try {
    localStorage.setItem(ACK_KEY, '1')
  } catch {
    // ignore
  }
}

export function Banners() {
  const online = useOnline()
  return (
    <>
      {backend.mode === 'demo' && (
        <div className="bg-warn/15 px-4 py-2 text-center text-xs font-medium text-ink">{cs.common.demoBanner}</div>
      )}
      {!online && (
        <div className="bg-over/15 px-4 py-2 text-center text-sm font-medium text-ink" role="status">
          {cs.common.offline}
        </div>
      )}
    </>
  )
}

const NAV = [
  { to: '/', label: cs.nav.today, Icon: TodayIcon, end: true },
  { to: '/graf', label: cs.nav.chart, Icon: ChartIcon, end: false },
  { to: '/skupina', label: cs.nav.group, Icon: GroupIcon, end: false },
  { to: '/nastaveni', label: cs.nav.settings, Icon: SettingsIcon, end: false },
]

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <ul className="mx-auto flex max-w-md">
        {NAV.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition',
                  isActive ? 'text-accent' : 'text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('rounded-full px-4 py-1 transition', isActive && 'bg-accent/12')}>
                    <Icon className="size-[22px]" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function AppShell() {
  return (
    <div className="min-h-dvh pb-24">
      <Banners />
      <main className="mx-auto max-w-md px-4 pt-6 pb-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

/** Plain centered layout for screens without navigation (login, wizard…). */
export function BareLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Banners />
      <main className="mx-auto max-w-md px-4 pt-8 pb-10">{children}</main>
    </div>
  )
}

export function RequireSafetyAck() {
  const location = useLocation()
  if (!hasSafetyAck()) return <Navigate to="/vitej" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function RequireAuth() {
  const { user, loading } = useSession()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/prihlaseni" replace />
  return <Outlet />
}

export function GuestOnly() {
  const { user, loading } = useSession()
  if (loading) return <Loading />
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}

export function RequirePlan({ children }: { children: ReactNode }) {
  const plan = useActivePlan()
  if (plan.isPending) return <Loading />
  if (plan.isError) return <ErrorState error={plan.error} onRetry={() => plan.refetch()} />
  if (!plan.data) return <Navigate to="/plan/novy" replace />
  return <>{children}</>
}
