import type { Settings, ThemeSetting, UiScale } from '@shared/models'
import { useI18n } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { useSettings } from '@/state/settings'
import { useToast } from '@/state/toast'
import { Segmented, SettingsCard, ToggleRow } from '@/components/settings/SettingsParts'

/** The palette of the old launcher (ui/src/components/settings/settingsData.ts). */
const ACCENT_COLOURS = [
  '#00b2ff',
  '#6c63ff',
  '#8b5cf6',
  '#ec4899',
  '#10b981',
  '#00ffcc',
  '#f59e0b',
  '#ef4444',
  '#f97316',
  '#64748b'
] as const

const THEME_LABELS: Record<ThemeSetting, MessageKey> = {
  system: 'settings.theme.system',
  dark: 'settings.theme.dark',
  light: 'settings.theme.light'
}

const UI_SCALE_LABELS: Record<UiScale, MessageKey> = {
  compact: 'settings.uiScale.compact',
  default: 'settings.uiScale.default',
  comfortable: 'settings.uiScale.comfortable'
}

/** Darstellung: theme, interface size, accent colour and visual effects. */
export function AppearanceSection() {
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
      <SettingsCard title={t('settings.theme')} icon="lucide:monitor">
        <Segmented<ThemeSetting>
          label={t('settings.theme')}
          value={settings.theme}
          onChange={(theme) => void apply({ theme })}
          options={(Object.keys(THEME_LABELS) as ThemeSetting[]).map((id) => ({ id, label: t(THEME_LABELS[id]) }))}
        />
      </SettingsCard>

      <SettingsCard title={t('settings.uiScale')} hint={t('settings.uiScale.hint')} icon="lucide:maximize">
        <Segmented<UiScale>
          label={t('settings.uiScale')}
          value={settings.uiScale}
          onChange={(uiScale) => void apply({ uiScale })}
          options={(Object.keys(UI_SCALE_LABELS) as UiScale[]).map((id) => ({ id, label: t(UI_SCALE_LABELS[id]) }))}
        />
      </SettingsCard>

      <SettingsCard title={t('settings.accentColor')} hint={t('settings.accentColor.hint')} icon="lucide:palette">
        <div className="flex flex-wrap gap-[7px]">
          {ACCENT_COLOURS.map((colour) => {
            const selected = settings.accentColor.toLowerCase() === colour
            return (
              <button
                key={colour}
                type="button"
                title={colour}
                aria-label={t('settings.accentColor.pick', { colour })}
                aria-pressed={selected}
                onClick={() => void apply({ accentColor: colour })}
                className={`size-[30px] rounded-[7px] border-2 transition-transform duration-200 hover:scale-110 ${
                  selected ? 'border-white shadow-[var(--shadow-accent-sm)]' : 'border-white/20'
                }`}
                style={{ background: colour }}
              />
            )
          })}
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.visual')} icon="lucide:sparkles">
        <ToggleRow
          label={t('settings.animations')}
          hint={t('settings.animations.hint')}
          checked={settings.animationsEnabled}
          onChange={(animationsEnabled) => void apply({ animationsEnabled })}
        />
        <ToggleRow
          label={t('settings.showFps')}
          hint={t('settings.showFps.hint')}
          checked={settings.showFps}
          onChange={(showFps) => void apply({ showFps })}
        />
      </SettingsCard>
    </div>
  )
}
