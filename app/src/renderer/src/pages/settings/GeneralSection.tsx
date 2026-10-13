import { useCallback, useEffect } from 'react'
import { Icon } from '@iconify/react'
import type { DiscordState, Language, ProfileSort, Settings } from '@shared/models'
import { useI18n } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useSettings } from '@/state/settings'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Segmented, SettingsCard, ToggleRow } from '@/components/settings/SettingsParts'

const DISCORD_STATE_KEYS: Record<DiscordState, MessageKey> = {
  disabled: 'settings.discord.state.disabled',
  not_configured: 'settings.discord.state.not_configured',
  waiting_for_discord: 'settings.discord.state.waiting_for_discord',
  rejected: 'settings.discord.state.rejected',
  connected: 'settings.discord.state.connected'
}

const PROFILE_SORT_KEYS: Record<ProfileSort, MessageKey> = {
  lastPlayed: 'settings.profileSort.lastPlayed',
  name: 'settings.profileSort.name',
  createdAt: 'settings.profileSort.createdAt'
}

/** Allgemein: language, start behaviour, profile list and Discord rich presence. */
export function GeneralSection() {
  const { t } = useI18n()
  const { settings, update } = useSettings()
  const toast = useToast()

  const apply = async (patch: Partial<Settings>): Promise<void> => {
    try {
      await update(patch)
    } catch (error) {
      toast.error(error)
    }
  }

  return (
    <div className="grid gap-5">
      <SettingsCard title={t('settings.language')} icon="lucide:languages">
        <Segmented<Language>
          label={t('settings.language')}
          value={settings.language}
          onChange={(language) => void apply({ language })}
          options={[
            { id: 'de', label: 'Deutsch' },
            { id: 'en', label: 'English' }
          ]}
        />
      </SettingsCard>

      <SettingsCard title={t('settings.general.options')} icon="lucide:sliders-horizontal">
        <ToggleRow
          label={t('settings.closeOnLaunch')}
          hint={t('settings.closeOnLaunch.hint')}
          checked={settings.closeOnLaunch}
          onChange={(closeOnLaunch) => void apply({ closeOnLaunch })}
        />
        <ToggleRow
          label={t('settings.openLogs')}
          hint={t('settings.openLogs.hint')}
          checked={settings.openLogsOnLaunch}
          onChange={(openLogsOnLaunch) => void apply({ openLogsOnLaunch })}
        />
        <ToggleRow
          label={t('settings.multiProfile')}
          hint={t('settings.multiProfile.hint')}
          checked={settings.multiProfile !== false}
          onChange={(multiProfile) => void apply({ multiProfile })}
        />
        <div className="grid gap-2">
          <span className="font-medium">{t('settings.profileSort')}</span>
          <Segmented<ProfileSort>
            label={t('settings.profileSort')}
            value={settings.profileSort}
            onChange={(profileSort) => void apply({ profileSort })}
            options={(Object.keys(PROFILE_SORT_KEYS) as ProfileSort[]).map((id) => ({
              id,
              label: t(PROFILE_SORT_KEYS[id])
            }))}
          />
          <span className="text-[13px] text-subtle">{t('settings.profileSort.hint')}</span>
          <span className="mt-2 font-medium">{t('settings.quickJoin')}</span>
          <Segmented<'name' | 'address'>
            label={t('settings.quickJoin')}
            value={settings.quickJoinLabel}
            onChange={(quickJoinLabel) => void apply({ quickJoinLabel })}
            options={[
              { id: 'name', label: t('settings.quickJoin.name') },
              { id: 'address', label: t('settings.quickJoin.address') }
            ]}
          />
          <span className="text-[13px] text-subtle">{t('settings.quickJoin.hint')}</span>
        </div>
        <ToggleRow
          label={t('settings.favouritesFirst')}
          hint={t('settings.favouritesFirst.hint')}
          checked={settings.favouritesFirst}
          onChange={(favouritesFirst) => void apply({ favouritesFirst })}
        />
      </SettingsCard>

      <DiscordCard />
    </div>
  )
}

/** Discord rich presence: the switch, the application id, and what the connection is doing right now. */
function DiscordCard() {
  const { t } = useI18n()
  const { settings, update } = useSettings()
  const toast = useToast()
  const loadStatus = useCallback(() => api.discord.status(), [])
  const status = useAsync(loadStatus)
  const { reload } = status
  // Discord may start or stop at any time, so the state is looked at again every few seconds.
  useEffect(() => {
    const timer = window.setInterval(reload, 5000)
    return () => window.clearInterval(timer)
  }, [reload])

  const current = status.data
  const state: DiscordState = settings.discordPresence ? (current?.state ?? 'waiting_for_discord') : 'disabled'
  const tone =
    state === 'connected'
      ? 'text-accent'
      : state === 'rejected' || state === 'not_configured'
        ? 'text-amber-300'
        : 'text-subtle'
  const icon =
    state === 'connected'
      ? 'lucide:check-circle-2'
      : state === 'waiting_for_discord'
        ? 'lucide:loader-circle'
        : state === 'disabled'
          ? 'lucide:circle-slash'
          : 'lucide:alert-triangle'

  const applyToggle = async (discordPresence: boolean): Promise<void> => {
    try {
      await update({ discordPresence })
      reload()
    } catch (error) {
      toast.error(error)
    }
  }

  return (
    <SettingsCard title={t('settings.discord.title')} icon="simple-icons:discord">
      <ToggleRow
        label={t('settings.discord.toggle')}
        hint={t('settings.discord.toggle.hint')}
        checked={settings.discordPresence}
        onChange={(checked) => void applyToggle(checked)}
      />

      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <Icon icon={icon} className={`size-3.5 ${tone} ${state === 'waiting_for_discord' ? 'animate-spin' : ''}`} />
        <span className={tone}>{t(DISCORD_STATE_KEYS[state])}</span>
        {state === 'connected' && current && (
          <span className="text-subtle">
            ·{' '}
            {t(current.transport === 'named pipe' ? 'settings.discord.transport.pipe' : 'settings.discord.transport.unix')}
          </span>
        )}
        <Button size="sm" variant="ghost" icon="lucide:refresh-cw" className="ml-auto" onClick={reload}>
          {t('settings.discord.refresh')}
        </Button>
      </div>

      <Field label={t('settings.discord.appId')} hint={t('settings.fixed')}>
        <div className="w-full select-all rounded-[10px] border border-line bg-surface-input px-3 py-2 font-mono text-[13px] text-subtle">
          {settings.discordApplicationId || '—'}
        </div>
      </Field>
    </SettingsCard>
  )
}
