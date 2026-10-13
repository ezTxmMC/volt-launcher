import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from '@iconify/react'
import type { Job, SyncPackAutoResult } from '@shared/models'
import { useI18n } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { useJobs } from '@/state/jobs'
import { useSettings } from '@/state/settings'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { Badge, type Tone } from '@/components/ui/Badge'
import { ErrorNotice, ProgressBar } from '@/components/ui/Feedback'
import { Field, Select } from '@/components/ui/Field'
import { SettingsCard } from '@/components/settings/SettingsParts'
import { newestReleases } from './options'

const RESULT_LIMIT = 10

const RESULT_LABELS: Record<SyncPackAutoResult['status'], MessageKey> = {
  created: 'syncpacks.result.created',
  skipped: 'syncpacks.result.skipped',
  failed: 'syncpacks.result.failed'
}

const RESULT_TONES: Record<SyncPackAutoResult['status'], Tone> = {
  created: 'success',
  skipped: 'neutral',
  failed: 'danger'
}

/** Status of the automatic creation, the manual check, and the profile for one chosen version. */
export function PackAutoStatusCard() {
  const { t, language } = useI18n()
  const { settings } = useSettings()
  const toast = useToast()
  const { jobs, track } = useJobs()

  const loadStatus = useCallback(() => api.syncpacks.auto(), [])
  const status = useAsync(loadStatus)
  const { reload } = status

  const loadVersions = useCallback(() => api.versions.minecraft({}), [])
  const versions = useAsync(loadVersions)
  const choices = useMemo(() => newestReleases(versions.data ?? []), [versions.data])

  const [chosen, setChosen] = useState('')
  const selectedVersion = choices.some((version) => version.id === chosen) ? chosen : (choices[0]?.id ?? '')

  // The check and the create run one at a time; this is the job of the last one started here.
  const [jobId, setJobId] = useState<string | null>(null)
  const job: Job | undefined = jobId ? jobs.find((entry) => entry.id === jobId) : undefined
  const running = job?.state === 'running'
  const finished = job !== undefined && job.state !== 'running'

  // When the job ends, the results and the counters are read again.
  useEffect(() => {
    if (jobId && finished) reload()
  }, [jobId, finished, reload])

  const start = async (request: () => Promise<Job>): Promise<void> => {
    try {
      const started = await request()
      track(started)
      setJobId(started.id)
    } catch (error) {
      toast.error(error)
    }
  }

  const enabled = settings.syncPackAutoEnabled === true
  const data = status.data
  const recent = useMemo(() => (data?.results ?? []).slice(-RESULT_LIMIT).reverse(), [data])

  return (
    <SettingsCard title={t('syncpacks.status.title')} icon="lucide:activity">
      {status.error && <ErrorNotice message={`${t('syncpacks.status.loadFailed')} ${status.error}`} onRetry={reload} />}

      {data && (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <StatusItem label={t('syncpacks.status.enabled')}>
            <Badge tone={enabled ? 'success' : 'neutral'} icon={enabled ? 'lucide:check' : 'lucide:circle-slash'}>
              {enabled ? t('syncpacks.status.on') : t('syncpacks.status.off')}
            </Badge>
          </StatusItem>
          <StatusItem label={t('syncpacks.status.lastCheck')}>
            <span>{data.lastCheck ? formatRelative(data.lastCheck, language) : t('syncpacks.status.never')}</span>
          </StatusItem>
          <StatusItem label={t('syncpacks.status.seen')}>
            <span className="tabular-nums">{data.seen}</span>
          </StatusItem>
          {data.lastError && (
            <StatusItem label={t('syncpacks.status.lastError')}>
              <span className="break-words text-danger-text">{data.lastError}</span>
            </StatusItem>
          )}
        </dl>
      )}

      {data && !enabled && <p className="text-[13px] text-subtle">{t('syncpacks.status.offHint')}</p>}

      <div className="grid gap-3 rounded-[10px] border border-line bg-surface-input-muted p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[14px] text-muted">
            {running && (
              <>
                <Icon icon="lucide:loader-circle" className="size-3.5 shrink-0 animate-spin" />
                <span className="truncate">{job?.message || t('syncpacks.running')}</span>
              </>
            )}
          </div>
          <Button variant="secondary" icon="lucide:refresh-cw" disabled={running} onClick={() => void start(() => api.syncpacks.autoCheck())}>
            {t('syncpacks.check')}
          </Button>
        </div>
        {running && job && <ProgressBar value={job.progress > 0 ? job.progress : null} label={job.title} showPercent caption={job.message || undefined} />}

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <Field label={t('syncpacks.create.label')} hint={t('syncpacks.create.hint')}>
              <Select value={selectedVersion} onChange={(event) => setChosen(event.target.value)} disabled={choices.length === 0}>
                {choices.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.id}
                  </option>
                ))}
              </Select>
            </Field>
            {versions.error && <p className="mt-1 text-[12px] text-danger-text">{errorMessage(versions.error)}</p>}
            {!versions.error && versions.data !== undefined && choices.length === 0 && (
              <p className="mt-1 text-[12px] text-subtle">{t('syncpacks.create.none')}</p>
            )}
          </div>
          <Button
            variant="primary"
            icon="lucide:package-plus"
            disabled={selectedVersion === '' || running}
            onClick={() => void start(() => api.syncpacks.autoCreate(selectedVersion))}
          >
            {t('syncpacks.create.button')}
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <span className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{t('syncpacks.results.title')}</span>
        {recent.length === 0 ? (
          <p className="text-[13px] text-subtle">{t('syncpacks.results.empty')}</p>
        ) : (
          <ul className="grid max-h-80 min-w-0 gap-1.5 overflow-y-auto overscroll-contain">
            {recent.map((result, index) => (
              <li
                key={`${result.minecraftVersion}-${index}`}
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface-input-muted px-3 py-2"
              >
                <span className="w-20 shrink-0 font-mono text-[13px] font-semibold">{result.minecraftVersion}</span>
                <Badge tone={RESULT_TONES[result.status]}>{t(RESULT_LABELS[result.status])}</Badge>
                {result.reason && <span className="min-w-0 flex-1 break-words text-[13px] text-subtle">{result.reason}</span>}
                {result.profileId && (
                  <Link to={`/profiles/${result.profileId}`} className="shrink-0 text-[13px] font-medium text-accent hover:underline">
                    {t('syncpacks.results.open')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsCard>
  )
}

function StatusItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{label}</dt>
      <dd className="min-w-0 text-[14px]">{children}</dd>
    </div>
  )
}
