import type { ReactNode } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { I18nProvider } from '@/i18n'
import { AuthProvider, useAuth } from '@/state/auth'
import { BackendProvider, useBackendStatus } from '@/state/backend'
import { GamesProvider } from '@/state/games'
import { JobsProvider } from '@/state/jobs'
import { SettingsProvider } from '@/state/settings'
import { ToastProvider } from '@/state/toast'
import { Shell } from '@/components/Shell'
import { BackendErrorScreen, StartingScreen } from '@/components/StartupScreens'
import { DiscoverPage } from '@/pages/DiscoverPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NewsPage } from '@/pages/NewsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProfileDetailPage } from '@/pages/ProfileDetailPage'
import { ProfilesPage } from '@/pages/ProfilesPage'
import { ProjectPage } from '@/pages/ProjectPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { PacksPage } from '@/pages/packs/PacksPage'
import { AccountsPage } from '@/pages/accounts/AccountsPage'
import { SkinsPage } from '@/pages/accounts/SkinsPage'
import { SavesPage } from '@/pages/saves/SavesPage'

/** Shows the splash or error screen until the backend answers; renders children once it is ready. */
function BackendGate({ children }: { children: ReactNode }) {
  const status = useBackendStatus()
  if (status.state === 'error') return <BackendErrorScreen status={status} />
  if (status.state === 'starting') return <StartingScreen />
  return <>{children}</>
}

/** Every route except /login needs a signed-in Microsoft account; otherwise the user goes to the login page. */
function RequireSignIn() {
  const { signedIn } = useAuth()
  return signedIn ? <Outlet /> : <Navigate to="/login" replace />
}

export function App() {
  return (
    <I18nProvider>
      <BackendProvider>
        <BackendGate>
          <SettingsProvider fallback={<StartingScreen />}>
            <ToastProvider>
              <JobsProvider>
                <GamesProvider>
                <HashRouter>
                  <AuthProvider>
                    <Routes>
                      <Route path="login" element={<LoginPage />} />
                      <Route element={<RequireSignIn />}>
                        <Route element={<Shell />}>
                          <Route index element={<HomePage />} />
                          <Route path="profiles" element={<ProfilesPage />} />
                          <Route path="profiles/:id" element={<ProfileDetailPage />} />
                          <Route path="profiles/:id/saves" element={<SavesPage />} />
                          <Route path="discover" element={<DiscoverPage />} />
                          <Route path="discover/:provider/:id" element={<ProjectPage />} />
                          <Route path="packs" element={<PacksPage />} />
                          <Route path="news" element={<NewsPage />} />
                          <Route path="settings" element={<SettingsPage />} />
                          <Route path="accounts" element={<AccountsPage />} />
                          <Route path="skins" element={<SkinsPage />} />
                          <Route path="*" element={<NotFoundPage />} />
                        </Route>
                      </Route>
                    </Routes>
                  </AuthProvider>
                </HashRouter>
                </GamesProvider>
              </JobsProvider>
            </ToastProvider>
          </SettingsProvider>
        </BackendGate>
      </BackendProvider>
    </I18nProvider>
  )
}
