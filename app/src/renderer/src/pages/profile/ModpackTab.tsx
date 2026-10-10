import { useCallback, useState } from 'react'
import { Icon } from '@iconify/react'
import type { Job, Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { ProviderBadge } from '@/components/Badges'
import { ConfirmModal } from '@/components/ConfirmModal'
import { ExportDialog, ImportDialog } from '@/components/content/PackDialogs'
import { ConnectModpackDialog } from '@/components/modpack/ConnectModpackDialog'
import { packLinkOf } from '@/components/modpack/packLink'
import { JobRow } from '@/components/JobRow'
import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Field'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'

/**
 * The modpack of a profile: connect it to a pack (or see the pack it came from), its releases,
 * updates to a chosen release, disconnecting, and export and import of packs.
 */
export function ModpackTab({ profile }: { profile: Profile }) {
  const { t } = useI18n()
  const toast = useToast()
  const { jobs, track } = useJobs()
  const load = useCallback(() => api.modpack.status(profile.id), [profile.id])
  const { data: status, error, loading, reload } = useAsync(load)
  const link = packLinkOf(status)
  const linked = link !== null
  // The release list only exists for a linked profile; it loads again once the link changes.
  const loadVersions = useCallback(
    () => (linked ? api.modpack.versions(profile.id).then((list) => list.versions) : Promise.resolve([])),
    [profile.id, linked]
  )
  const { data: versions, reload: reloadVersions } = useAsync(loadVersions)

  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [jobIds, setJobIds] = useState<readonly string[]>([])
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  useJobFinished((job) => {
    if (!jobIds.includes(job.id)) return
    reload()
    reloadVersions()
    if (job.state === 'failed') toast.error(job.error ?? job.title)
    else if (job.state === 'done') toast.success(t('job.finished', { title: job.title }))
  })

  const ownJobs = jobs.filter((job) => jobIds.includes(job.id) && job.state === 'running')
  const installedNumber =
    versions?.find((release) => release.id === link?.versionId)?.versionNumber || link?.versionNumber || link?.versionId || '–'

  const remember = (job: Job): void => {
    setJobIds((current) => [...current, job.id])
    track(job)
  }

  const startUpdate = async (versionId?: string): Promise<void> => {
    setBusy(true)
    try {
      remember(await api.modpack.update(profile.id, versionId))
    } catch (problem) {
      toast.error(problem)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorNotice message={error} onRetry={reload} />
  if (!status && loading) return <LoadingBlock />

  return (
    <div className="grid gap-4">
      <section className="grid gap-4 rounded-xl border border-line bg-surface p-5">
        <h3 className="font-semibold">{t('modpack.title')}</h3>
        {link ? (
          <>
            <div className="grid min-w-0 gap-1">
              <p className="text-sm text-muted">{t('profile.modpack.linkedWith')}</p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="min-w-0 font-medium break-words">{link.name}</p>
                <ProviderBadge provider={link.provider} />
              </div>
            </div>
            <p className="text-sm text-muted">
              {t('modpack.installedVersion')}: {installedNumber}
            </p>
            {status?.updateAvailable && (
              <p className="text-accent">
                {t('modpack.updateAvailable', { version: status.latestVersionNumber || status.latestVersionId || '' })}
              </p>
            )}
            {status && !status.updateAvailable && !status.reason && <p className="text-muted">{t('modpack.upToDate')}</p>}
            {status?.reason && <p className="text-muted">{status.reason}</p>}
            {status?.updateAvailable && (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon="lucide:circle-arrow-up" loading={busy} onClick={() => void startUpdate()}>
                  {t('modpack.update')}
                </Button>
              </div>
            )}
            {link.projectId !== '' && (versions?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <Field label={t('modpack.chooseRelease')}>
                    <Select value={choice} onChange={(event) => setChoice(event.target.value)}>
                      <option value="">–</option>
                      {versions?.map((release) => (
                        <option key={release.id} value={release.id}>
                          {release.versionNumber || release.name}
                          {release.id === link.versionId ? ` (${t('content.currentVersion')})` : ''}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Button
                  disabled={choice === '' || choice === link.versionId || busy}
                  onClick={() => void startUpdate(choice)}
                >
                  {t('modpack.chooseRelease')}
                </Button>
              </div>
            )}
            <p className="text-sm text-muted">{t('modpack.keepsContent')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon="lucide:unlink" onClick={() => setDisconnectOpen(true)}>
                {t('profile.modpack.disconnect')}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-center gap-2">
              <Icon icon="lucide:package" className="size-5 shrink-0 text-subtle" />
              <p className="font-medium">{t('profile.modpack.empty.title')}</p>
            </div>
            <p className="text-muted">{t('profile.modpack.empty.description')}</p>
            <Button variant="primary" icon="lucide:link" onClick={() => setConnectOpen(true)}>
              {t('profile.modpack.connect')}
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-wrap gap-2 rounded-xl border border-line bg-surface p-5">
        <Button icon="lucide:package-open" onClick={() => setExporting(true)}>
          {t('modpack.export')}
        </Button>
        <Button icon="lucide:download" onClick={() => setImporting(true)}>
          {t('modpack.import')}
        </Button>
      </section>

      {ownJobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}

      {exporting && <ExportDialog profile={profile} onClose={() => setExporting(false)} />}
      {importing && <ImportDialog onStarted={remember} onClose={() => setImporting(false)} />}
      {connectOpen && (
        <ConnectModpackDialog
          profileId={profile.id}
          onClose={() => setConnectOpen(false)}
          onConnected={() => {
            setConnectOpen(false)
            reload()
          }}
        />
      )}
      {disconnectOpen && link && (
        <ConfirmModal
          title={t('profile.modpack.disconnect.title')}
          message={t('profile.modpack.disconnect.message', { name: link.name })}
          confirmLabel={t('profile.modpack.disconnect.confirm')}
          onConfirm={async () => {
            await api.modpack.disconnect(profile.id)
            toast.success(t('profile.modpack.disconnect.done', { name: link.name }))
            reload()
          }}
          onClose={() => setDisconnectOpen(false)}
        />
      )}
    </div>
  )
}
