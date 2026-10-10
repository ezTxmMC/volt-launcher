import { useCallback } from 'react'
import { Icon } from '@iconify/react'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useSettings } from '@/state/settings'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Feedback'
import { Field } from '@/components/ui/Field'
import { SettingsCard } from '@/components/settings/SettingsParts'

/** Anbieter: which content sources are reachable and the (fixed) CurseForge bridge address. */
export function ProvidersSection() {
  const { t } = useI18n()
  const { settings } = useSettings()
  const loadProviders = useCallback(() => api.providers.list(), [])
  const providers = useAsync(loadProviders)
  const { reload } = providers

  return (
    <div className="grid gap-5">
      <SettingsCard title={t('settings.section.providers')} hint={t('settings.providers.hint')} icon="lucide:blocks">
        {providers.error && <ErrorNotice message={providers.error} onRetry={reload} />}
        <div className="grid gap-2">
          {providers.data?.map((provider) => (
            <div key={provider.id} className="flex items-center gap-3 rounded-[10px] border border-line bg-surface-input-muted px-3.5 py-3">
              <span className={`size-2 shrink-0 rounded-full ${provider.configured ? 'bg-emerald-400' : 'bg-white/20'}`} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{provider.name}</div>
                <div className={`text-[13px] ${provider.configured ? 'text-accent' : 'text-subtle'}`}>
                  {provider.configured ? t('settings.providers.online') : provider.message || t('settings.providers.offline')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.bridge')} hint={t('settings.bridge.hint')} icon="lucide:link">
        <Field label={t('settings.bridge')} hint={t('settings.fixed')}>
          <span className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface-input-muted px-[13px] font-mono text-[13px] text-muted select-all">
            <Icon icon="lucide:lock" className="size-3.5 shrink-0 text-subtle" />
            <span className="min-w-0 truncate">{settings.bridgeUrl || '—'}</span>
          </span>
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" icon="lucide:plug-zap" loading={providers.loading && !providers.data} onClick={reload}>
            {t('settings.providers.test')}
          </Button>
        </div>
        {!providers.data && !providers.error && (
          <span className="inline-flex items-center gap-2 text-[13px] text-subtle">
            <Icon icon="lucide:loader-circle" className="size-3 animate-spin" />
            {t('common.loading')}
          </span>
        )}
      </SettingsCard>
    </div>
  )
}
