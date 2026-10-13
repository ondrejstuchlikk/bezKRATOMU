import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppError } from './api'
import { SessionProvider } from './auth/SessionProvider'
import { AppShell, GuestOnly, RequireAuth, RequirePlan, RequireSafetyAck } from './components/layout'
import { Loading } from './components/ui'
import { DayPage } from './pages/DayPage'
import { GroupPage } from './pages/GroupPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { LoginPage, RegisterPage } from './pages/AuthPages'
import { NotFoundPage } from './pages/NotFoundPage'
import { SafetyPage, WelcomePage } from './pages/SafetyPages'
import { SettingsPage } from './pages/SettingsPage'
import { TodayPage } from './pages/TodayPage'

// Chart-heavy pages are loaded on demand to keep the first load small.
const ChartsPage = lazy(() => import('./pages/ChartsPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const PlanPage = lazy(() => import('./pages/PlanPage'))
const PlanWizardPage = lazy(() => import('./pages/PlanWizardPage'))
const PlanEditPage = lazy(() => import('./pages/PlanEditPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => !(error instanceof AppError && error.code === 'invalid_login') && count < 2,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <HashRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/vitej" element={<WelcomePage />} />
              <Route path="/bezpecnost" element={<SafetyPage />} />
              <Route element={<RequireSafetyAck />}>
                <Route element={<GuestOnly />}>
                  <Route path="/prihlaseni" element={<LoginPage />} />
                  <Route path="/registrace" element={<RegisterPage />} />
                </Route>
                <Route element={<RequireAuth />}>
                  <Route path="/plan/novy" element={<PlanWizardPage />} />
                  <Route element={<AppShell />}>
                    <Route
                      index
                      element={
                        <RequirePlan>
                          <TodayPage />
                        </RequirePlan>
                      }
                    />
                    <Route path="/graf" element={<ChartsPage />} />
                    <Route path="/zebricek" element={<LeaderboardPage />} />
                    <Route path="/skupina" element={<GroupPage />} />
                    <Route path="/nastaveni" element={<SettingsPage />} />
                    <Route path="/plan" element={<PlanPage />} />
                    <Route path="/plan/upravit" element={<PlanEditPage />} />
                    <Route path="/u/:userId" element={<ProfilePage />} />
                    <Route path="/u/:userId/:date" element={<DayPage />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </SessionProvider>
    </QueryClientProvider>
  )
}
