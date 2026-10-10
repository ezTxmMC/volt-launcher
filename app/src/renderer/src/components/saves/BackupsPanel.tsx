import { useCallback, useState } from 'react'
import { Icon } from '@iconify/react'
import type { BackupInfo, Job, Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { formatBytes, formatDate, formatRelative } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Stagger } from '@/components/motion/Stagger'
import { JobRow } from '@/components/JobRow'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { FormModal } from './dialogs'

type BackupDialog =
  | { kind: 'create' }
  | { kind: 'restore'; backup: BackupInfo }
  | { kind: 'delete'; backup: BackupInfo }

export function BackupsPanel({ profile }: { profile: Profile }) {
  const { t, language } = useI18n()
  const toast = useToast()
  const { jobs, track } = useJobs()
  const load = useCallback(() => api.saves.backups(profile.id).then((result) => result.backups), [profile.id])
  const { data: backups, error, loading, reload } = useAsync(load)
  const [dialog, setDialog] = useState<BackupDialog | null>(null)
  const [jobIds, setJobIds] = useState<readonly string[]>([])

  // Backups are written and restored as jobs: refresh the list when one of ours ends.
  useJobFinished((job: Job) => {
    if (!jobIds.includes(job.id)) return
    reload()
    if (job.state === 'failed') toast.error(job.error ?? job.title)
    else if (job.state === 'done') toast.success(t('job.finished', { title: job.title }))
  })

  const ownJobs = jobs.filter((job) => jobIds.includes(job.id) && job.state === 'running')
  const close = (): void => setDialog(null)

  const startJob = (job: Job): void => {
    setJobIds((current) => [...current, job.id])
    track(job)
  }

  const openFolder = async (): Promise<void> => {
    try {
      const folder = await api.saves.openBackupsFolder(profile.id)
      const problem = await window.volt?.openPath(folder.path)
      if (problem) toast.error(problem)
    } catch (failure) {
      toast.error(failure)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button icon="lucide:refresh-cw" onClick={reload}>
          {t('saves.refresh')}
        </Button>
        {window.volt && (
          <Button icon="lucide:folder-open" onClick={() => void openFolder()}>
            {t('saves.openFolder')}
          </Button>
        )}
        <Button
          variant="primary"
          icon="lucide:archive"
          disabled={ownJobs.length > 0}
          onClick={() => setDialog({ kind: 'create' })}
        >
          {t('saves.backups.create')}
        </Button>
      </div>

      {ownJobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}

      {error && <ErrorNotice message={error} onRetry={reload} />}
      {!backups && loading && <LoadingBlock />}

      {backups && backups.length === 0 && (
        <EmptyState icon="lucide:archive" title={t('saves.backups.empty.title')} description={t('saves.backups.empty.description')} />
      )}

      {backups && backups.length > 0 && (
        <Stagger as="ul" className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {backups.map((backup) => (
            <li key={backup.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="grid size-10 place-items-center rounded-md border border-line bg-surface-3 text-subtle">
                <Icon icon="lucide:archive" className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium" title={backup.label}>
                  {backup.label}
                </p>
                <p className="truncate text-xs text-subtle" title={backup.id}>
                  {formatDate(backup.createdAt, language)} · {formatRelative(backup.createdAt, language)} ·{' '}
                  {formatBytes(backup.sizeBytes, language)} · {t('saves.backups.files', { count: backup.fileCount })}
                </p>
                {backup.minecraftVersion && (
                  <div className="mt-1.5">
                    <Badge>
                      {t('saves.backups.version', { version: backup.minecraftVersion, loader: backup.loader || 'vanilla' })}
                    </Badge>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  icon="lucide:rotate-ccw"
                  disabled={ownJobs.length > 0}
                  onClick={() => setDialog({ kind: 'restore', backup })}
                >
                  {t('saves.backups.restore')}
                </Button>
                <IconButton
                  icon="lucide:trash-2"
                  label={t('saves.backups.delete')}
                  className="hover:text-danger"
                  onClick={() => setDialog({ kind: 'delete', backup })}
                />
              </div>
            </li>
          ))}
        </Stagger>
      )}

      {dialog?.kind === 'create' && (
        <FormModal
          title={t('saves.backups.createTitle')}
          submitLabel={t('saves.backups.create')}
          fields={[{ key: 'label', label: t('saves.backups.label'), value: '', hint: t('saves.backups.labelHint') }]}
          onClose={close}
          onSubmit={async (values) => {
            startJob(await api.saves.createBackup(profile.id, values.label ?? ''))
          }}
        />
      )}

      {dialog?.kind === 'restore' && (
        <ConfirmModal
          title={t('saves.backups.restoreTitle')}
          message={t('saves.backups.restoreMessage', { name: dialog.backup.label })}
          confirmLabel={t('saves.backups.restore')}
          onClose={close}
          onConfirm={async () => {
            startJob(await api.saves.restoreBackup(profile.id, dialog.backup.id))
          }}
        />
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmModal
          title={t('saves.backups.deleteTitle')}
          message={t('saves.backups.deleteMessage', { name: dialog.backup.label })}
          confirmLabel={t('saves.backups.delete')}
          onClose={close}
          onConfirm={async () => {
            await api.saves.deleteBackup(profile.id, dialog.backup.id)
            reload()
            toast.success(t('saves.deleted'))
          }}
        />
      )}
    </div>
  )
}
