import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '@iconify/react'
import type { Profile, SyncedFolder, SyncReportEntry, UpdateProfileRequest } from '@shared/models'
import { type Translate, useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { parseOptionalInt } from '@/lib/format'
import { useSettings } from '@/state/settings'
import { useToast } from '@/state/toast'
import { ProfileAvatar } from '@/components/ProfileCard'
import { SYNCED_ITEMS } from '@/components/profile/syncedItems'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { Switch } from '@/components/ui/Switch'

const ICON_MAX_BYTES = 300 * 1024
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
const STATUS_POLL_MS = 3000

interface EnvRow {
  key: string
  value: string
}

/** The editable copy of a profile; every field is text or a flag, so the form stays simple. */
interface Draft {
  name: string
  group: string
  favourite: boolean
  memory: string
  javaPath: string
  jvmArgs: string
  wrapperCommand: string
  envRows: EnvRow[]
  preLaunchCommand: string
  postExitCommand: string
  gameDirectory: string
  fullscreen: boolean
  /** 'default' follows the global setting; 'on' and 'off' override it. */
  hideLauncher: 'default' | 'on' | 'off'
}

function draftOf(profile: Profile): Draft {
  return {
    name: profile.name,
    group: profile.group ?? '',
    favourite: profile.favourite,
    memory: profile.memoryMb?.toString() ?? '',
    javaPath: profile.javaPath ?? '',
    jvmArgs: profile.jvmArgs,
    wrapperCommand: profile.wrapperCommand ?? '',
    envRows: Object.entries(profile.envVars).map(([key, value]) => ({ key, value })),
    preLaunchCommand: profile.preLaunchCommand ?? '',
    postExitCommand: profile.postExitCommand ?? '',
    gameDirectory: profile.gameDirectory ?? '',
    fullscreen: profile.fullscreen,
    hideLauncher: profile.hideLauncher === null ? 'default' : profile.hideLauncher ? 'on' : 'off'
  }
}

/** Absolute paths on Linux/macOS ("/…") and Windows ("C:\…" or "C:/…"). */
function isAbsolutePath(text: string): boolean {
  return text.startsWith('/') || /^[A-Za-z]:[\\/]/.test(text)
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="grid content-start gap-4">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </Card>
  )
}

/** A switch with its text on the left, as in the old settings panels. */
function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-1">
        <span className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{label}</span>
        {hint && <span className="text-[12px] leading-[1.5] text-subtle">{hint}</span>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

/** The toast line for one folder of a sync report; `enabled` is whether the folder is shared now. */
function reportLine(entry: SyncReportEntry, enabled: boolean, t: Translate): string {
  const name = t(SYNCED_ITEMS.find((item) => item.key === entry.key)?.label.profile ?? 'profile.synced.title')
  if (!enabled) return t('profile.synced.report.disabled', { name })
  if (entry.moved === 0 && entry.conflicts === 0) return t('profile.synced.report.empty', { name })
  const moved = t('profile.synced.report.enabled', { name, moved: entry.moved })
  return entry.conflicts > 0 ? moved + t('profile.synced.report.conflicts', { conflicts: entry.conflicts }) : moved
}

/**
 * The shared-folder switches. Each change sends the full list at once; the switch shows the new state
 * until the profile is reloaded, and goes back when the backend refuses the change.
 */
function SharedFolders({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const loadGame = useCallback(() => api.game.status(profile.id), [profile.id])
  const { data: game, reload: reloadGame } = useAsync(loadGame)
  // The list being saved (or just saved); it applies only while profile.synced is still the one it was made from.
  const [draft, setDraft] = useState<{ base: readonly SyncedFolder[] | undefined; list: SyncedFolder[] } | null>(null)
  const [saving, setSaving] = useState<SyncedFolder | null>(null)
  const current: readonly SyncedFolder[] = draft && draft.base === profile.synced ? draft.list : (profile.synced ?? [])
  const running = game?.running === true

  useEffect(() => {
    const timer = setInterval(reloadGame, STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [reloadGame])

  const change = async (key: SyncedFolder, on: boolean): Promise<void> => {
    if (saving !== null || running) return
    const next = SYNCED_ITEMS.map((item) => item.key).filter((item) => (item === key ? on : current.includes(item)))
    setDraft({ base: profile.synced, list: next })
    setSaving(key)
    try {
      const result = await api.profiles.setSynced(profile.id, next)
      const lines = (result.syncReport ?? []).map((entry) => reportLine(entry, next.includes(entry.key), t))
      toast.success(lines.length > 0 ? lines.join(' · ') : t('profile.saved'))
      onChanged()
    } catch (error) {
      setDraft(null)
      toast.error(error)
      reloadGame()
    } finally {
      setSaving(null)
    }
  }

  return (
    <Section title={t('profile.synced.title')}>
      <p className="text-[13px] leading-[1.6] text-muted">{t('profile.synced.hint')}</p>
      {running && (
        <p className="flex items-center gap-2 text-[13px] font-medium text-warning">
          <Icon icon="lucide:circle-alert" className="size-4 shrink-0" aria-hidden="true" />
          {t('profile.synced.gameRunning')}
        </p>
      )}
      <ul className="grid gap-2 md:grid-cols-2">
        {SYNCED_ITEMS.map((item) => {
          const label = t(item.label.profile)
          const busy = saving === item.key
          return (
            <li key={item.key} className="flex items-center justify-between gap-4 rounded-lg border border-line px-3.5 py-2.5">
              <span className="grid min-w-0 gap-0.5">
                <span className="text-[14px] font-medium break-words">{label}</span>
                {item.hint && <span className="text-[12px] leading-[1.5] text-subtle">{t(item.hint.profile)}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {busy && (
                  <span role="status" aria-label={t('profile.synced.saving')} title={t('profile.synced.saving')}>
                    <Icon icon="lucide:loader-circle" className="size-4 animate-spin text-subtle" aria-hidden="true" />
                  </span>
                )}
                <Switch
                  checked={current.includes(item.key)}
                  onChange={(value) => void change(item.key, value)}
                  label={label}
                  disabled={running || saving !== null}
                />
              </span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

export function SettingsTab({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const { settings } = useSettings()
  const groupsLoad = useCallback(() => api.profiles.groups(), [])
  const { data: groups } = useAsync(groupsLoad)
  const [draft, setDraft] = useState<Draft>(() => draftOf(profile))
  const [saving, setSaving] = useState(false)
  const [iconBusy, setIconBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const update = <K extends keyof Draft>(key: K, value: Draft[K]): void => setDraft((current) => ({ ...current, [key]: value }))
  const setEnvRow = (index: number, patch: Partial<EnvRow>): void =>
    setDraft((current) => ({
      ...current,
      envRows: current.envRows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    }))

  const memory = parseOptionalInt(draft.memory)
  const memoryInvalid = memory === undefined
  const names = draft.envRows.map((row) => row.key.trim()).filter((key) => key !== '')
  const badEnv = draft.envRows.find((row) => row.key.trim() !== '' && !ENV_NAME.test(row.key.trim()))
  const duplicateEnv = names.find((key, index) => names.indexOf(key) !== index)
  const directoryInvalid = draft.gameDirectory.trim() !== '' && !isAbsolutePath(draft.gameDirectory.trim())
  const nameInvalid = draft.name.trim() === ''

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(profile))
  const problem = nameInvalid
    ? t('profile.settings.emptyName')
    : memoryInvalid
      ? t('profile.settings.memoryInvalid')
      : directoryInvalid
        ? t('profile.settings.invalidDirectory')
        : badEnv
          ? t('profile.settings.invalidEnv', { name: badEnv.key.trim() })
          : duplicateEnv
            ? t('profile.settings.duplicateEnv', { name: duplicateEnv })
            : null
  const canSave = dirty && problem === null && !saving

  const save = async (): Promise<void> => {
    if (!canSave) return
    const envVars: Record<string, string> = {}
    for (const row of draft.envRows) {
      if (row.key.trim() !== '') envVars[row.key.trim()] = row.value
    }
    const patch: UpdateProfileRequest = {
      name: draft.name.trim(),
      group: draft.group.trim() || null,
      favourite: draft.favourite,
      memoryMb: memory ?? null,
      javaPath: draft.javaPath.trim() || null,
      jvmArgs: draft.jvmArgs,
      wrapperCommand: draft.wrapperCommand.trim() || null,
      envVars,
      preLaunchCommand: draft.preLaunchCommand.trim() || null,
      postExitCommand: draft.postExitCommand.trim() || null,
      gameDirectory: draft.gameDirectory.trim() || null,
      fullscreen: draft.fullscreen,
      hideLauncher: draft.hideLauncher === 'default' ? null : draft.hideLauncher === 'on'
    }
    setSaving(true)
    try {
      const saved = await api.profiles.update(profile.id, patch)
      setDraft(draftOf(saved))
      toast.success(t('profile.saved'))
      onChanged()
    } catch (error) {
      toast.error(error)
    } finally {
      setSaving(false)
    }
  }

  const pickIcon = async (file: File | undefined): Promise<void> => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.settings.iconInvalid'))
      return
    }
    if (file.size > ICON_MAX_BYTES) {
      toast.error(t('profile.settings.iconTooBig'))
      return
    }
    setIconBusy(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error(t('profile.settings.iconInvalid')))
        reader.readAsDataURL(file)
      })
      await api.profiles.setIcon(profile.id, dataUrl)
      toast.success(t('profile.saved'))
      onChanged()
    } catch (error) {
      toast.error(error)
    } finally {
      setIconBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const removeIcon = async (): Promise<void> => {
    setIconBusy(true)
    try {
      await api.profiles.update(profile.id, { iconUrl: null })
      onChanged()
    } catch (error) {
      toast.error(error)
    } finally {
      setIconBusy(false)
    }
  }

  const chooseDirectory = async (): Promise<void> => {
    const picked = await window.volt?.pickDirectory()
    if (picked) update('gameDirectory', picked)
  }

  const hideGlobal = settings.closeOnLaunch ? t('profile.settings.hideLauncherGlobal.on') : t('profile.settings.hideLauncherGlobal.off')

  return (
    <form
      className="grid gap-6 lg:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <Section title={t('profile.section.general')}>
        <div className="flex items-center gap-4">
          <ProfileAvatar name={profile.name} size="lg" iconUrl={profile.iconUrl} />
          <div className="grid gap-2">
            <span className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{t('profile.settings.icon')}</span>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(event) => void pickIcon(event.target.files?.[0])}
              />
              <Button icon="lucide:upload" disabled={iconBusy} loading={iconBusy} onClick={() => fileInput.current?.click()}>
                {t('profile.settings.iconPick')}
              </Button>
              {profile.iconUrl && (
                <Button variant="ghost" icon="lucide:x" disabled={iconBusy} onClick={() => void removeIcon()}>
                  {t('profile.settings.iconRemove')}
                </Button>
              )}
            </div>
            <span className="text-[12px] text-subtle">{t('profile.settings.iconHint')}</span>
          </div>
        </div>
        <Field label={t('profiles.field.name')}>
          <TextInput value={draft.name} onChange={(event) => update('name', event.target.value)} required />
        </Field>
        <Field label={t('profiles.field.group')} hint={t('profiles.field.groupHint')}>
          <TextInput
            value={draft.group}
            list="profile-groups"
            maxLength={60}
            onChange={(event) => update('group', event.target.value)}
          />
          <datalist id="profile-groups">
            {(groups ?? []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
        <ToggleRow label={t('profile.settings.favourite')} checked={draft.favourite} onChange={(value) => update('favourite', value)} />
      </Section>

      <Section title={t('profile.section.java')}>
        <Field label={t('profile.settings.memory')} hint={t('profile.settings.memoryHint', { value: settings.memoryMb })}>
          <TextInput
            inputMode="numeric"
            value={draft.memory}
            onChange={(event) => update('memory', event.target.value)}
            placeholder={String(settings.memoryMb)}
            aria-invalid={memoryInvalid}
          />
        </Field>
        <Field label={t('profile.settings.java')} hint={t('profile.settings.javaHint')}>
          <TextInput
            value={draft.javaPath}
            onChange={(event) => update('javaPath', event.target.value)}
            placeholder="/usr/lib/jvm/java-21/bin/java"
          />
        </Field>
        <Field label={t('profile.settings.jvmArgs')} hint={t('profile.settings.jvmArgsHint')}>
          <TextArea
            value={draft.jvmArgs}
            onChange={(event) => update('jvmArgs', event.target.value)}
            placeholder="-XX:+UseG1GC"
            spellCheck={false}
          />
        </Field>
        <Field label={t('profile.settings.wrapper')} hint={t('profile.settings.wrapperHint')}>
          <TextInput
            value={draft.wrapperCommand}
            onChange={(event) => update('wrapperCommand', event.target.value)}
            placeholder="gamemoderun"
            spellCheck={false}
          />
        </Field>
      </Section>

      <Section title={t('profile.section.env')}>
        <p className="text-[12px] text-subtle">{t('profile.settings.envHint')}</p>
        <div className="grid gap-2">
          {draft.envRows.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <TextInput
                value={row.key}
                aria-label={t('profile.settings.envName')}
                placeholder={t('profile.settings.envName')}
                spellCheck={false}
                onChange={(event) => setEnvRow(index, { key: event.target.value })}
              />
              <TextInput
                value={row.value}
                aria-label={t('profile.settings.envValue')}
                placeholder={t('profile.settings.envValue')}
                spellCheck={false}
                onChange={(event) => setEnvRow(index, { value: event.target.value })}
              />
              <IconButton
                icon="lucide:x"
                label={t('profile.settings.envRemove')}
                onClick={() => update('envRows', draft.envRows.filter((_, i) => i !== index))}
              />
            </div>
          ))}
        </div>
        <div>
          <Button
            variant="secondary"
            icon="lucide:plus"
            onClick={() => update('envRows', [...draft.envRows, { key: '', value: '' }])}
          >
            {t('profile.settings.envAdd')}
          </Button>
        </div>
      </Section>

      <Section title={t('profile.section.hooks')}>
        <Field label={t('profile.settings.preLaunch')} hint={t('profile.settings.preLaunchHint')}>
          <TextInput
            value={draft.preLaunchCommand}
            onChange={(event) => update('preLaunchCommand', event.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field label={t('profile.settings.postExit')} hint={t('profile.settings.postExitHint')}>
          <TextInput
            value={draft.postExitCommand}
            onChange={(event) => update('postExitCommand', event.target.value)}
            spellCheck={false}
          />
        </Field>
      </Section>

      <div className="lg:col-span-2">
        <SharedFolders profile={profile} onChanged={onChanged} />
      </div>

      <Section title={t('profile.section.game')}>
        <Field label={t('profile.settings.gameDirectory')} hint={t('profile.settings.gameDirectoryHint')}>
          <div className="flex gap-2">
            <TextInput
              value={draft.gameDirectory}
              onChange={(event) => update('gameDirectory', event.target.value)}
              placeholder={profile.gameDir}
              aria-invalid={directoryInvalid}
              spellCheck={false}
            />
            {window.volt && (
              <Button icon="lucide:folder-open" onClick={() => void chooseDirectory()}>
                {t('profile.settings.gameDirectoryPick')}
              </Button>
            )}
            {draft.gameDirectory !== '' && (
              <Button variant="ghost" onClick={() => update('gameDirectory', '')}>
                {t('profile.settings.gameDirectoryReset')}
              </Button>
            )}
          </div>
        </Field>
        <ToggleRow label={t('profile.settings.fullscreen')} checked={draft.fullscreen} onChange={(value) => update('fullscreen', value)} />
        <Field label={t('profile.settings.hideLauncher')} hint={t('profile.settings.hideLauncherHint', { value: hideGlobal })}>
          <Select value={draft.hideLauncher} onChange={(event) => update('hideLauncher', event.target.value as Draft['hideLauncher'])}>
            <option value="default">{t('profile.settings.hideLauncherDefault', { value: hideGlobal })}</option>
            <option value="on">{t('profile.settings.hideLauncherGlobal.on')}</option>
            <option value="off">{t('profile.settings.hideLauncherGlobal.off')}</option>
          </Select>
        </Field>
      </Section>

      <div className="grid gap-2 lg:col-span-2">
        {problem && dirty && <p className="text-[13px] text-danger-text">{problem}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(draftOf(profile))}>
            {t('profile.settings.reset')}
          </Button>
          <Button type="submit" variant="primary" icon="lucide:save" disabled={!canSave} loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </form>
  )
}
