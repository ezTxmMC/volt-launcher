import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Settings } from '@shared/models'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { applyAppearance } from '@/lib/appearance'
import { applyTheme, resolveTheme } from '@/lib/theme'
import { useI18n } from '@/i18n'

interface SettingsValue {
  settings: Settings
  update: (patch: Partial<Settings>) => Promise<void>
}

const SettingsContext = createContext<SettingsValue | null>(null)

/** Loads the settings once the backend is ready and keeps language and theme in sync. */
export function SettingsProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const load = useCallback(() => api.settings.get(), [])
  const { data: loaded, error, reload } = useAsync(load)
  const [override, setOverride] = useState<Settings | null>(null)
  const settings = override ?? loaded
  const { setLanguage } = useI18n()

  useEffect(() => {
    if (!settings) return
    setLanguage(settings.language)
    applyTheme(settings.theme)
    applyAppearance(settings)
    if (settings.theme !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (): void => {
      document.documentElement.dataset['theme'] = resolveTheme('system')
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [settings, setLanguage])

  const update = useCallback(async (patch: Partial<Settings>) => {
    setOverride(await api.settings.patch(patch))
  }, [])

  const value = useMemo(() => (settings ? { settings, update } : null), [settings, update])

  if (!value) {
    return error ? <SettingsFailure message={error} onRetry={reload} /> : fallback
  }
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

function SettingsFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="max-w-md space-y-3">
        <p className="text-danger">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-surface-3 px-4 py-2 font-medium hover:bg-line-strong"
        >
          {t('common.retry')}
        </button>
      </div>
    </div>
  )
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used inside SettingsProvider')
  return value
}
