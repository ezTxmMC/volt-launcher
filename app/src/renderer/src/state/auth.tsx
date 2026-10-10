import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AccountsView } from '@shared/models'
import { onAccountsChanged } from '@/components/accounts/data'
import { AccountLoadErrorScreen, StartingScreen } from '@/components/StartupScreens'
import { api, errorMessage, onSignInRequired } from '@/lib/api'

interface AuthValue {
  /** True when a Microsoft account is selected and the launcher is not in offline mode. */
  signedIn: boolean
  /** Reloads the account state from the backend. */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * Holds the account state that gates the app. The launcher is only usable with a Microsoft account:
 * without one (offline mode, or no account) every route except /login redirects to the login page.
 * The state reloads after sign-in and sign-out, and when the backend reports `sign_in_required`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AccountsView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const refreshing = useRef(false)

  const refresh = useCallback(async (): Promise<void> => {
    refreshing.current = true
    try {
      const next = await api.accounts.list()
      setView(next)
      setLoadError(null)
    } catch (failure) {
      setLoadError(errorMessage(failure))
    } finally {
      refreshing.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => onAccountsChanged(() => void refresh()), [refresh])

  // A refresh that is already running answers the same question, so a signal during it is ignored.
  useEffect(
    () =>
      onSignInRequired(() => {
        if (!refreshing.current) void refresh()
      }),
    [refresh]
  )

  const value = useMemo<AuthValue>(
    () => ({
      signedIn: view !== null && !view.offlineMode && view.accounts.some((account) => account.type === 'microsoft'),
      refresh
    }),
    [view, refresh]
  )

  if (view === null) {
    if (loadError) return <AccountLoadErrorScreen message={loadError} onRetry={() => void refresh()} />
    return <StartingScreen />
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
