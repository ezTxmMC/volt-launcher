import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import type { UpdateDownloadResult, UpdateInfo } from '@shared/models'
import { useI18n } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { formatBytes, formatDate } from '@/lib/format'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useSettings } from '@/state/settings'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Feedback'
import { SettingsCard, ToggleRow } from '@/components/settings/SettingsParts'

/** Where the launcher reads its releases from. Fixed by the backend; shown read-only. */
const UPDATE_SOURCE = 'cdn.volt-launcher.app'

/** Updates: the update channel, the release check, the installer download and the release page. */
export function UpdatesSection() {
  const { t, language } = useI18n()
  const { settings, update } = useSettings()
  const toast = useToast()
  const { jobs, track } = useJobs()
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [downloadJobId, setDownloadJobId] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState<UpdateDownloadResult | null>(null)

  const check = useCallback(async (force: boolean): Promise<void> => {
    setChecking(true)
    setCheckError(null)
    try {
      setInfo(await api.updates.check(force))
    } catch (error) {
      setCheckError(errorMessage(error))
    } finally {
      setChecking(false)
    }
  }, [])

  // The cached answer of the backend is shown at once; "Jetzt prüfen" asks it again.
  useEffect(() => {
    void check(false)
  }, [check])

  useJobFinished(
    useCallback((job) => {
      if (job.kind === 'update-download' && job.state === 'done' && job.result) {
        setDownloaded(job.result as unknown as UpdateDownloadResult)
      }
    }, [])
  )

  const apply = async (patch: Parameters<typeof update>[0], recheck = false): Promise<void> => {
    try {
      await update(patch)
      if (recheck) void check(true)
    } catch (error) {
      toast.error(error)
    }
  }

  const startDownload = async (): Promise<void> => {
    try {
      const job = await api.updates.download()
      track(job)
      setDownloadJobId(job.id)
      setDownloaded(null)
    } catch (error) {
      toast.error(error)
    }
  }

  const openFolder = async (directory: string): Promise<void> => {
    if (!window.volt) {
      toast.error('Electron bridge not available')
      return
    }
    const problem = await window.volt.openPath(directory)
    if (problem) toast.error(problem)
  }

  const openRelease = async (): Promise<void> => {
    try {
      const { url } = await api.updates.openRelease()
      window.open(url, '_blank', 'noopener')
    } catch (error) {
      toast.error(error)
    }
  }

  const downloadJob = downloadJobId ? jobs.find((job) => job.id === downloadJobId) : undefined
  const downloading = downloadJob?.state === 'running'
  const downloadFailed = downloadJob?.state === 'failed'
  const notes = info?.notes.trim() ?? ''

  return (
    <div className="grid gap-5">
      <SettingsCard title={t('settings.updates.channel')} hint={t('settings.updates.channel.hint')} icon="lucide:download">
        <ToggleRow
          label={t('settings.autoUpdate')}
          hint={t('settings.autoUpdate.hint')}
          checked={settings.autoUpdate}
          onChange={(autoUpdate) => void apply({ autoUpdate })}
        />
        <ToggleRow
          label={t('settings.betaUpdates')}
          hint={t('settings.betaUpdates.hint')}
          checked={settings.betaUpdates}
          onChange={(betaUpdates) => void apply({ betaUpdates }, true)}
        />
        <div className="flex items-center gap-2 text-[13px] text-subtle">
          <Icon icon="lucide:lock" className="size-3.5 shrink-0" />
          <span>{t('settings.updates.source')}:</span>
          <span className="font-mono text-muted select-all">{UPDATE_SOURCE}</span>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.section.updates')} icon="lucide:refresh-cw">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={checking ? 'lucide:loader-circle' : 'lucide:refresh-cw'} loading={checking} onClick={() => void check(true)}>
            {checking ? t('settings.updates.checking') : t('settings.updates.check')}
          </Button>
          {info && (
            <span className="text-[13px] text-subtle">{t('settings.updates.current', { version: info.currentVersion })}</span>
          )}
        </div>

        {checkError && <ErrorNotice message={`${t('settings.updates.failed')}: ${checkError}`} onRetry={() => void check(true)} />}

        {info?.available && (
          <div className="grid gap-3 rounded-lg border border-[var(--accent-border-strong)] bg-accent-soft px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Icon icon="lucide:arrow-up-circle" className="size-4 shrink-0 text-accent" />
              <span className="font-semibold">{t('settings.updates.available', { version: info.latestVersion })}</span>
              {info.prerelease && (
                <span className="rounded-[5px] border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">
                  {t('settings.updates.prerelease')}
                </span>
              )}
              {info.publishedAt && <span className="text-[12px] text-subtle">{formatDate(info.publishedAt, language)}</span>}
            </div>

            {notes && (
              <div className="grid gap-1">
                <span className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{t('settings.updates.notes')}</span>
                <p className="max-h-[160px] overflow-y-auto rounded bg-black/20 p-2.5 text-[12.5px] leading-[1.6] whitespace-pre-wrap text-muted">
                  {notes}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {info.downloadable ? (
                <Button
                  variant="primary"
                  icon={downloading ? 'lucide:loader-circle' : 'lucide:download'}
                  loading={downloading}
                  disabled={downloading}
                  onClick={() => void startDownload()}
                >
                  {downloading ? t('settings.updates.downloading') : t('settings.updates.download')}
                  {info.assetSize > 0 && <span className="font-normal text-subtle">({formatBytes(info.assetSize, language)})</span>}
                </Button>
              ) : (
                <span className="text-[13px] text-subtle">{t('settings.updates.noAsset')}</span>
              )}
              {downloaded && (
                <Button variant="secondary" icon="lucide:folder-open" onClick={() => void openFolder(downloaded.directory)}>
                  {t('settings.updates.openFolder')}
                </Button>
              )}
              <Button variant="secondary" icon="lucide:external-link" onClick={() => void openRelease()}>
                {t('settings.updates.openRelease')}
              </Button>
            </div>

            {downloadFailed && <ErrorNotice message={`${t('settings.updates.downloadFailed')}: ${downloadJob?.error ?? ''}`} />}
            {downloaded && (
              <div className="grid gap-1 text-[13px] text-muted">
                <span>{t('settings.updates.downloaded', { file: downloaded.fileName })}</span>
                <span className={downloaded.verified ? 'text-accent' : 'text-amber-300'}>
                  {downloaded.verified ? t('settings.updates.verified') : t('settings.updates.unverified')}
                </span>
              </div>
            )}
          </div>
        )}

        {info && !info.available && !info.reason && (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-3 px-3.5 py-2.5">
            <Icon icon="lucide:check-circle-2" className="size-4 shrink-0 text-accent" />
            <span className="text-muted">{t('settings.updates.upToDate')}</span>
          </div>
        )}

        {info && !info.available && info.reason && (
          <div className="flex items-start gap-2 rounded-lg border border-line bg-surface-3 px-3.5 py-2.5">
            <Icon icon="lucide:info" className="mt-0.5 size-4 shrink-0 text-subtle" />
            <span className="text-[13px] leading-[1.5] text-muted">{info.reason}</span>
          </div>
        )}
      </SettingsCard>
    </div>
  )
}
