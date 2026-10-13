import { useEffect, useState } from 'react'
import type { SyncPack, SyncPackAutoLoader, SyncPackAutoVersions } from '@shared/models'
import { useI18n } from '@/i18n'
import { useSettings } from '@/state/settings'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field, Select } from '@/components/ui/Field'
import { SettingsCard, ToggleRow } from '@/components/settings/SettingsParts'
import { SYNC_AUTO_LOADERS, autoLoaderOrDefault, autoVersionsOrDefault, packIdsOrEmpty, sameIds } from './options'

/**
 * The switch, loader, version kind and the packs of the automatic profiles. Everything is saved with one
 * settings PATCH.
 */
export function PackAutoConfigCard({ packs }: { packs: readonly SyncPack[] }) {
  const { t } = useI18n()
  const { settings, update } = useSettings()
  const toast = useToast()

  const savedEnabled = settings.syncPackAutoEnabled === true
  const savedLoader = autoLoaderOrDefault(settings.syncPackAutoLoader)
  const savedVersions = autoVersionsOrDefault(settings.syncPackAutoVersions)
  const savedPacks = packIdsOrEmpty(settings.syncPackAutoPacks)

  const [enabled, setEnabled] = useState(savedEnabled)
  const [loader, setLoader] = useState<SyncPackAutoLoader>(savedLoader)
  const [versions, setVersions] = useState<SyncPackAutoVersions>(savedVersions)
  const [selected, setSelected] = useState<string[]>(savedPacks)
  const [saving, setSaving] = useState(false)

  // Values that come back from a save (or change elsewhere) replace the drafts.
  useEffect(() => {
    setEnabled(settings.syncPackAutoEnabled === true)
    setLoader(autoLoaderOrDefault(settings.syncPackAutoLoader))
    setVersions(autoVersionsOrDefault(settings.syncPackAutoVersions))
    setSelected(packIdsOrEmpty(settings.syncPackAutoPacks))
  }, [settings.syncPackAutoEnabled, settings.syncPackAutoLoader, settings.syncPackAutoVersions, settings.syncPackAutoPacks])

  const dirty =
    enabled !== savedEnabled || loader !== savedLoader || versions !== savedVersions || !sameIds(selected, savedPacks)

  const setPack = (id: string, on: boolean): void => {
    setSelected((current) => (on ? [...current.filter((existing) => existing !== id), id] : current.filter((existing) => existing !== id)))
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await update({
        syncPackAutoEnabled: enabled,
        syncPackAutoLoader: loader,
        syncPackAutoVersions: versions,
        syncPackAutoPacks: selected
      })
      toast.success(t('settings.saved'))
    } catch (error) {
      toast.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard title={t('syncpacks.auto.title')} icon="lucide:sparkles" hint={t('syncpacks.auto.hint')}>
      <ToggleRow
        label={t('syncpacks.auto.enabled')}
        hint={t('syncpacks.auto.enabledHint')}
        checked={enabled}
        onChange={setEnabled}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('syncpacks.auto.loader')}>
          <Select value={loader} onChange={(event) => setLoader(autoLoaderOrDefault(event.target.value))}>
            {SYNC_AUTO_LOADERS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('syncpacks.auto.versions')}>
          <Select value={versions} onChange={(event) => setVersions(autoVersionsOrDefault(event.target.value))}>
            <option value="release">{t('syncpacks.auto.versions.release')}</option>
            <option value="snapshots">{t('syncpacks.auto.versions.snapshots')}</option>
          </Select>
        </Field>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{t('syncpacks.auto.packs')}</legend>
        <p className="text-[12px] leading-[1.5] text-subtle">{t('syncpacks.auto.packsHint')}</p>
        {packs.length === 0 ? (
          <p className="rounded-[10px] border border-line bg-surface-input-muted px-3 py-3 text-[13px] text-subtle">
            {t('syncpacks.auto.packsEmpty')}
          </p>
        ) : (
          <div className="grid gap-2.5 rounded-[10px] border border-line bg-surface-input-muted p-3 sm:grid-cols-2">
            {packs.map((pack) => (
              <Checkbox
                key={pack.id}
                checked={selected.includes(pack.id)}
                onChange={(on) => setPack(pack.id, on)}
                label={pack.name}
                count={pack.entries.length}
              />
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty && <span className="mr-auto text-[13px] text-subtle">{t('syncpacks.unsavedHint')}</span>}
        <Button variant="primary" icon="lucide:save" disabled={!dirty} loading={saving} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      </div>
    </SettingsCard>
  )
}
