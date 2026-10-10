import { useCallback, useEffect, useState } from 'react'
import type { AutoProfileLoader, AutoProfileMod, AutoProfileVersions } from '@shared/models'
import { useI18n } from '@/i18n'
import { useSettings } from '@/state/settings'
import { useToast } from '@/state/toast'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { SettingsCard, ToggleRow } from '@/components/settings/SettingsParts'
import { ModLogo } from '@/components/mods/ModLogo'
import { ModPicker } from './ModPicker'
import { AUTO_PROFILE_LOADERS, loaderOrDefault, modsOrEmpty, sameMods, versionsOrDefault } from './options'

/** The switch, loader, version kind and preset mods. Everything is saved with one settings PATCH. */
export function AutoProfilesConfigCard() {
  const { t } = useI18n()
  const { settings, update } = useSettings()
  const toast = useToast()

  const savedEnabled = settings.autoProfilesEnabled === true
  const savedLoader = loaderOrDefault(settings.autoProfileLoader)
  const savedVersions = versionsOrDefault(settings.autoProfileVersions)
  const savedMods = modsOrEmpty(settings.autoProfileMods)

  const [enabled, setEnabled] = useState(savedEnabled)
  const [loader, setLoader] = useState<AutoProfileLoader>(savedLoader)
  const [versions, setVersions] = useState<AutoProfileVersions>(savedVersions)
  const [mods, setMods] = useState<AutoProfileMod[]>(savedMods)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)

  // Values that come back from a save (or change elsewhere) replace the drafts.
  useEffect(() => {
    setEnabled(settings.autoProfilesEnabled === true)
    setLoader(loaderOrDefault(settings.autoProfileLoader))
    setVersions(versionsOrDefault(settings.autoProfileVersions))
    setMods(modsOrEmpty(settings.autoProfileMods))
  }, [settings.autoProfilesEnabled, settings.autoProfileLoader, settings.autoProfileVersions, settings.autoProfileMods])

  const dirty =
    enabled !== savedEnabled || loader !== savedLoader || versions !== savedVersions || !sameMods(mods, savedMods)

  const addMod = useCallback((mod: AutoProfileMod) => {
    setMods((current) => (current.some((entry) => entry.projectId === mod.projectId) ? current : [...current, mod]))
  }, [])

  const removeMod = (projectId: string): void => {
    setMods((current) => current.filter((entry) => entry.projectId !== projectId))
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await update({
        autoProfilesEnabled: enabled,
        autoProfileLoader: loader,
        autoProfileVersions: versions,
        autoProfileMods: mods
      })
      toast.success(t('settings.saved'))
    } catch (error) {
      toast.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard title={t('autoprofiles.section')} icon="lucide:sparkles">
      <ToggleRow
        label={t('autoprofiles.enabled')}
        hint={t('autoprofiles.enabled.hint')}
        checked={enabled}
        onChange={setEnabled}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('autoprofiles.loader')}>
          <Select value={loader} onChange={(event) => setLoader(loaderOrDefault(event.target.value))}>
            {AUTO_PROFILE_LOADERS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('autoprofiles.versions')}>
          <Select value={versions} onChange={(event) => setVersions(versionsOrDefault(event.target.value))}>
            <option value="release">{t('autoprofiles.versions.release')}</option>
            <option value="snapshots">{t('autoprofiles.versions.snapshots')}</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{t('autoprofiles.mods')}</span>
          <Button
            size="sm"
            variant="secondary"
            icon="lucide:plus"
            aria-expanded={picking}
            onClick={() => setPicking((open) => !open)}
          >
            {t('autoprofiles.mods.add')}
          </Button>
        </div>

        {/* The list scrolls inside its own box, so a long preset does not stretch the page. */}
        <ul
          aria-label={t('autoprofiles.mods')}
          className="grid max-h-72 min-w-0 gap-1.5 overflow-y-auto overscroll-contain rounded-[10px] border border-line bg-surface-input-muted p-2"
        >
          {mods.length === 0 ? (
            <li className="px-2 py-3 text-[13px] text-subtle">{t('autoprofiles.mods.empty')}</li>
          ) : (
            mods.map((mod) => (
              <li key={mod.projectId} className="flex min-w-0 items-center gap-3 rounded-lg px-2.5 py-1.5 hover:bg-white/[0.04]">
                <ModLogo provider={mod.provider} projectId={mod.projectId} />
                <span className="min-w-0 flex-1 truncate font-medium">{mod.name}</span>
                <IconButton
                  icon="lucide:x"
                  label={t('autoprofiles.mods.remove', { name: mod.name })}
                  onClick={() => removeMod(mod.projectId)}
                />
              </li>
            ))
          )}
        </ul>
        <p className="text-[12px] leading-[1.5] text-subtle">{t('autoprofiles.mods.note')}</p>
        <p className="text-[12px] leading-[1.5] text-subtle">{t('profile.synced.autoProfiles')}</p>

        {picking && <ModPicker loader={loader} selected={mods} onAdd={addMod} onClose={() => setPicking(false)} />}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty && <span className="mr-auto text-[13px] text-subtle">{t('autoprofiles.unsavedHint')}</span>}
        <Button variant="primary" icon="lucide:save" disabled={!dirty} loading={saving} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      </div>
    </SettingsCard>
  )
}
