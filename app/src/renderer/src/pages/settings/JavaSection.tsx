import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import type { JavaRuntimeEntry, JavaRuntimeOverride, JavaRuntimes } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useSettings } from '@/state/settings'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Feedback'
import { Field, TextInput } from '@/components/ui/Field'
import { SettingsCard } from '@/components/settings/SettingsParts'

const MEMORY_MIN_MB = 256
const MEMORY_MAX_MB = 1048576

/** Parses a whole number of megabytes, or undefined when the text is not one. */
function parseMegabytes(text: string): number | undefined {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  return value >= MEMORY_MIN_MB && value <= MEMORY_MAX_MB ? value : undefined
}

/** Java & Arbeitsspeicher: memory defaults, JVM arguments, the Java path and the Java runtimes. */
export function JavaSection() {
  return (
    <div className="grid gap-5">
      <MemoryCard />
      <RuntimesCard />
    </div>
  )
}

function MemoryCard() {
  const { t } = useI18n()
  const { settings, update } = useSettings()
  const toast = useToast()
  const [maxText, setMaxText] = useState(String(settings.memoryMb))
  const [minText, setMinText] = useState(String(settings.minMemoryMb))
  const [jvmArgs, setJvmArgs] = useState(settings.defaultJvmArgs)
  const [javaPath, setJavaPath] = useState(settings.javaPath ?? '')
  const [saving, setSaving] = useState(false)

  // Values that change elsewhere (reset, another screen) replace the drafts.
  useEffect(() => {
    setMaxText(String(settings.memoryMb))
    setMinText(String(settings.minMemoryMb))
    setJvmArgs(settings.defaultJvmArgs)
    setJavaPath(settings.javaPath ?? '')
  }, [settings.memoryMb, settings.minMemoryMb, settings.defaultJvmArgs, settings.javaPath])

  const maxValue = parseMegabytes(maxText)
  const minValue = parseMegabytes(minText)
  const orderInvalid = maxValue !== undefined && minValue !== undefined && minValue > maxValue
  const valid = maxValue !== undefined && minValue !== undefined && !orderInvalid
  const dirty =
    maxValue !== settings.memoryMb ||
    minValue !== settings.minMemoryMb ||
    jvmArgs.trim() !== settings.defaultJvmArgs ||
    (javaPath.trim() || null) !== settings.javaPath

  const save = async (): Promise<void> => {
    if (!valid || maxValue === undefined || minValue === undefined) return
    setSaving(true)
    try {
      await update({
        memoryMb: maxValue,
        minMemoryMb: minValue,
        defaultJvmArgs: jvmArgs.trim(),
        javaPath: javaPath.trim() || null
      })
      toast.success(t('settings.saved'))
    } catch (error) {
      toast.error(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard title={t('settings.memory')} hint={t('settings.memory.hint')} icon="lucide:memory-stick">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.memoryMin')}>
          <TextInput inputMode="numeric" value={minText} onChange={(event) => setMinText(event.target.value)} aria-invalid={minValue === undefined || orderInvalid} />
        </Field>
        <Field label={t('settings.memoryMax')}>
          <TextInput inputMode="numeric" value={maxText} onChange={(event) => setMaxText(event.target.value)} aria-invalid={maxValue === undefined || orderInvalid} />
        </Field>
      </div>
      {orderInvalid && <p className="text-[13px] text-danger-text">{t('settings.memory.minAbove')}</p>}

      <Field label={t('settings.jvmArgs')} hint={t('settings.jvmArgs.hint')}>
        <TextInput className="w-full font-mono text-[13px]" value={jvmArgs} onChange={(event) => setJvmArgs(event.target.value)} />
      </Field>

      <Field label={t('settings.java')} hint={t('settings.java.hint')}>
        <TextInput value={javaPath} onChange={(event) => setJavaPath(event.target.value)} placeholder="/usr/lib/jvm/java-21/bin/java" className="w-full font-mono text-[13px]" />
      </Field>

      <div className="flex justify-end">
        <Button variant="primary" icon="lucide:save" disabled={!dirty || !valid} loading={saving} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      </div>
    </SettingsCard>
  )
}

function RuntimesCard() {
  const { t } = useI18n()
  const { settings, update } = useSettings()
  const toast = useToast()
  const { jobs, track } = useJobs()
  const loadRuntimes = useCallback(() => api.java.runtimes(), [])
  const runtimes = useAsync(loadRuntimes)
  const { reload } = runtimes
  const [jobIds, setJobIds] = useState<Record<number, string>>({})

  // A finished install changes what is installed: look at the runtimes again.
  useJobFinished(
    useCallback(
      (job) => {
        if (job.kind === 'java-install') reload()
      },
      [reload]
    )
  )

  const install = async (majorVersion: number): Promise<void> => {
    try {
      const job = await api.java.install(majorVersion)
      track(job)
      setJobIds((previous) => ({ ...previous, [majorVersion]: job.id }))
    } catch (error) {
      toast.error(error)
    }
  }

  const saveOverride = async (majorVersion: number, text: string): Promise<void> => {
    const path = text.trim()
    const others = settings.javaRuntimes.filter((entry) => entry.majorVersion !== majorVersion)
    const next: JavaRuntimeOverride[] = path ? [...others, { majorVersion, path }] : others
    try {
      await update({ javaRuntimes: next })
      reload()
    } catch (error) {
      toast.error(error)
    }
  }

  const data: JavaRuntimes | undefined = runtimes.data
  const installed = (majorVersion: number): JavaRuntimeEntry | undefined =>
    data?.managed.find((entry) => entry.majorVersion === majorVersion) ??
    data?.detected.find((entry) => entry.majorVersion === majorVersion)

  return (
    <SettingsCard title={t('settings.javaRuntimes')} hint={t('settings.javaRuntimes.hint')} icon="lucide:coffee">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" icon="lucide:refresh-cw" loading={runtimes.loading && !data} onClick={reload}>
          {t('settings.java.rescan')}
        </Button>
      </div>

      {runtimes.error && <ErrorNotice message={runtimes.error} onRetry={reload} />}

      {data?.installable.map((majorVersion) => {
        const found = installed(majorVersion)
        const running = data.installing.find((entry) => entry.majorVersion === majorVersion)
        const jobId = running?.jobId ?? jobIds[majorVersion]
        const job = jobId ? jobs.find((entry) => entry.id === jobId) : undefined
        const downloading = job?.state === 'running' || running !== undefined
        const failed = job?.state === 'failed' && !downloading
        const override = settings.javaRuntimes.find((entry) => entry.majorVersion === majorVersion)?.path ?? ''
        const shownPath = override || found?.path || t('settings.java.none')

        return (
          <div key={majorVersion} className="grid gap-2 rounded-[10px] border border-line bg-surface-input-muted px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`grid size-9 shrink-0 place-items-center rounded-lg text-[14px] font-bold ${
                  found ? 'bg-accent-soft-strong text-accent' : 'bg-white/5 text-subtle'
                }`}
              >
                {majorVersion}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Java {majorVersion}</span>
                  {found && (
                    <span className="rounded-[4px] bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold tracking-[0.1em] text-accent">
                      {t('settings.java.ready')}
                    </span>
                  )}
                  {found?.managed && <span className="text-[12px] text-subtle">{t('settings.java.managed')}</span>}
                  {found && !found.managed && <span className="text-[12px] text-subtle">{t('settings.java.detected')}</span>}
                  {found?.version && <span className="text-[12px] text-subtle">{found.version}</span>}
                </div>
                <div className="truncate font-mono text-[12px] text-subtle">{shownPath}</div>
              </div>
              {!found && !downloading && (
                <Button size="sm" variant="primary" icon="lucide:download" onClick={() => void install(majorVersion)}>
                  {t('settings.java.install')}
                </Button>
              )}
              {downloading && (
                <span className="inline-flex items-center gap-1.5 text-[13.5px] text-muted">
                  <Icon icon="lucide:loader-circle" className="size-3 animate-spin" />
                  {job?.message || t('settings.java.installing')}
                </span>
              )}
            </div>
            {failed && <p className="text-[12px] text-danger-text">{job?.error ?? t('settings.java.failed')}</p>}
            <TextInput
              key={override}
              defaultValue={override}
              placeholder={t('settings.java.overrideHint')}
              aria-label={`${t('settings.java.override')} Java ${majorVersion}`}
              className="w-full font-mono text-[12px]"
              onBlur={(event) => {
                if (event.target.value.trim() !== override) void saveOverride(majorVersion, event.target.value)
              }}
            />
          </div>
        )
      })}
    </SettingsCard>
  )
}
