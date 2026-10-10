import { useCallback, useEffect, useState } from 'react'
import type { LauncherDirectory } from '@shared/models'
import { useI18n } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useSettings } from '@/state/settings'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Feedback'
import { Field, TextInput } from '@/components/ui/Field'
import { SettingsCard, ToggleRow } from '@/components/settings/SettingsParts'

const DIRECTORY_LABEL_KEYS: Record<LauncherDirectory['id'], MessageKey> = {
  root: 'settings.dir.root',
  profiles: 'settings.dir.profiles',
  logs: 'settings.dir.logs',
  exports: 'settings.dir.exports',
  backups: 'settings.dir.backups',
  updates: 'settings.dir.updates',
  runtimes: 'settings.dir.runtimes',
  cache: 'settings.dir.cache'
}

/** Erweitert: downloads, backups, the launcher's folders, diagnostics and reset. */
export function AdvancedSection() {
  return (
    <div className="grid gap-5">
      <DownloadsCard />
      <DirectoriesCard />
      <DiagnosticsCard />
      <ResetCard />
    </div>
  )
}

/** Parses a whole number in [min, max], or undefined. */
function parseRange(text: string, min: number, max: number): number | undefined {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  return value >= min && value <= max ? value : undefined
}

function DownloadsCard() {
  const { t } = useI18n()
  const { settings, update } = useSettings()
  const toast = useToast()
  const [threads, setThreads] = useState(String(settings.downloadThreads))
  const [backups, setBackups] = useState(String(settings.backupsToKeep))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setThreads(String(settings.downloadThreads))
    setBackups(String(settings.backupsToKeep))
  }, [settings.downloadThreads, settings.backupsToKeep])

  const threadsValue = parseRange(threads, 1, 64)
  const backupsValue = parseRange(backups, 0, 50)
  const threadsDirty = threadsValue !== settings.downloadThreads
  const backupsDirty = backupsValue !== settings.backupsToKeep

  const save = async (patch: { downloadThreads?: number; backupsToKeep?: number }): Promise<void> => {
    setSaving(true)
    try {
      await update(patch)
      toast.success(t('settings.saved'))
    } catch (error) {
      toast.error(error)
    } finally {
      setSaving(false)
    }
  }

  const apply = async (patch: Parameters<typeof update>[0]): Promise<void> => {
    try {
      await update(patch)
    } catch (error) {
      toast.error(error)
    }
  }

  return (
    <>
      <SettingsCard title={t('settings.threads')} hint={t('settings.threads.hint')} icon="lucide:gauge">
        <Field label={t('settings.threads')}>
          <TextInput inputMode="numeric" value={threads} onChange={(event) => setThreads(event.target.value)} aria-invalid={threadsValue === undefined} />
        </Field>
        <div className="flex justify-end">
          <Button
            variant="primary"
            icon="lucide:save"
            disabled={!threadsDirty || threadsValue === undefined}
            loading={saving}
            onClick={() => threadsValue !== undefined && void save({ downloadThreads: threadsValue })}
          >
            {t('common.save')}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.backups')} hint={t('settings.backups.hint')} icon="lucide:archive">
        <Field label={t('settings.backups.keep')} hint={t('settings.backups.keep.hint')}>
          <TextInput inputMode="numeric" value={backups} onChange={(event) => setBackups(event.target.value)} aria-invalid={backupsValue === undefined} />
        </Field>
        <ToggleRow
          label={t('settings.backups.beforePackUpdate')}
          hint={t('settings.backups.beforePackUpdate.hint')}
          checked={settings.backupBeforePackUpdate}
          onChange={(backupBeforePackUpdate) => void apply({ backupBeforePackUpdate })}
        />
        <div className="flex justify-end">
          <Button
            variant="primary"
            icon="lucide:save"
            disabled={!backupsDirty || backupsValue === undefined}
            loading={saving}
            onClick={() => backupsValue !== undefined && void save({ backupsToKeep: backupsValue })}
          >
            {t('common.save')}
          </Button>
        </div>
      </SettingsCard>
    </>
  )
}

function DirectoriesCard() {
  const { t } = useI18n()
  const toast = useToast()
  const loadDirectories = useCallback(() => api.settings.directories(), [])
  const directories = useAsync(loadDirectories)

  const open = async (id: LauncherDirectory['id']): Promise<void> => {
    try {
      const { path } = await api.settings.openDirectory(id)
      if (!window.volt) {
        toast.error('Electron bridge not available')
        return
      }
      const problem = await window.volt.openPath(path)
      if (problem) toast.error(problem)
    } catch (error) {
      toast.error(error)
    }
  }

  return (
    <SettingsCard title={t('settings.directories')} hint={t('settings.directories.hint')} icon="lucide:folder-tree">
      {directories.error && <ErrorNotice message={directories.error} onRetry={directories.reload} />}
      <div className="grid gap-2">
        {directories.data?.map((directory) => (
          <div
            key={directory.id}
            className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface-input-muted px-3.5 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{t(DIRECTORY_LABEL_KEYS[directory.id])}</div>
              <div className="truncate font-mono text-[12px] text-subtle">{directory.path}</div>
            </div>
            <Button size="sm" variant="secondary" icon="lucide:folder-open" onClick={() => void open(directory.id)}>
              {t('settings.open')}
            </Button>
          </div>
        ))}
      </div>
    </SettingsCard>
  )
}

function DiagnosticsCard() {
  const { t } = useI18n()
  const { settings } = useSettings()
  const toast = useToast()
  const loadDirectories = useCallback(() => api.settings.directories(), [])
  const directories = useAsync(loadDirectories)

  const openLogs = async (): Promise<void> => {
    try {
      const { path } = await api.settings.openDirectory('logs')
      if (!window.volt) {
        toast.error('Electron bridge not available')
        return
      }
      const problem = await window.volt.openPath(path)
      if (problem) toast.error(problem)
    } catch (error) {
      toast.error(error)
    }
  }

  const copyDebugInfo = async (): Promise<void> => {
    const lines = [
      `Language: ${settings.language}`,
      `Discord: ${settings.discordPresence ? 'on' : 'off'}`,
      `UA: ${navigator.userAgent}`,
      ...(directories.data ?? []).map((directory) => `${directory.id}: ${directory.path}`)
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.success(t('settings.debugCopied'))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <SettingsCard title={t('settings.debug')} hint={t('settings.debug.hint')} icon="lucide:bug">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon="lucide:folder-open" onClick={() => void openLogs()}>
          {t('settings.openLogsFolder')}
        </Button>
        <Button variant="secondary" icon="lucide:clipboard-copy" onClick={() => void copyDebugInfo()}>
          {t('settings.copyDebugInfo')}
        </Button>
      </div>
    </SettingsCard>
  )
}

function ResetCard() {
  const { t } = useI18n()
  const { update } = useSettings()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const reset = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.settings.reset()
      // An empty patch answers the current (reset) settings and refreshes the app state.
      await update({})
      setConfirming(false)
      toast.success(t('settings.reset.done'))
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard title={t('settings.reset')} hint={t('settings.reset.hint')} icon="lucide:rotate-ccw">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted">{t('settings.reset.confirm')}</span>
          <Button variant="danger" icon="lucide:rotate-ccw" loading={busy} onClick={() => void reset()}>
            {t('settings.reset.action')}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="danger" icon="lucide:rotate-ccw" onClick={() => setConfirming(true)}>
            {t('settings.reset')}
          </Button>
        </div>
      )}
    </SettingsCard>
  )
}
