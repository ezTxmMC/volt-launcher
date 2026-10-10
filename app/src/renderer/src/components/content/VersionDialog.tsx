import { useCallback, useState } from 'react'
import type { ContentType, Job, ModFile, Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useToast } from '@/state/toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'

/**
 * Lists every release of the project behind one installed file and installs the chosen one
 * (a job). The file's enabled state is kept by the backend.
 */
export function VersionDialog({
  profile,
  type,
  world,
  file,
  onClose,
  onStarted
}: {
  profile: Profile
  type: ContentType
  world?: string
  file: ModFile
  onClose: () => void
  onStarted: (job: Job) => void
}) {
  const { t, language } = useI18n()
  const toast = useToast()
  const load = useCallback(
    () => api.content.versions(profile.id, type, file.fileName, world),
    [profile.id, type, file.fileName, world]
  )
  const { data: releases, error, loading, reload } = useAsync(load)
  const [busy, setBusy] = useState<string | null>(null)
  const installedId = file.source?.versionId ?? ''

  const install = async (versionId: string): Promise<void> => {
    setBusy(versionId)
    try {
      const job = await api.content.changeVersion(profile.id, type, file.fileName, versionId, world)
      onStarted(job)
      onClose()
    } catch (problem) {
      toast.error(problem)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      title={t('content.versionsTitle', { name: file.metadata?.name || file.source?.name || file.fileName })}
      onClose={onClose}
      wide
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {!file.source && <p className="mb-3 text-muted">{t('content.untrackedVersions')}</p>}
      {error && <ErrorNotice message={error} onRetry={reload} />}
      {!releases && loading && <LoadingBlock />}
      {releases && releases.length === 0 && <p className="py-6 text-center text-muted">{t('content.versionsEmpty')}</p>}
      {releases && releases.length > 0 && (
        <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {releases.map((release) => {
            const current = release.id === installedId
            return (
              <li key={release.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{release.versionNumber || release.name}</p>
                  <p className="truncate text-xs text-subtle" title={release.fileName}>
                    {release.fileName}
                    {release.datePublished && ` · ${new Date(release.datePublished).toLocaleDateString(language)}`}
                  </p>
                </div>
                {release.releaseType !== 'release' && <Badge tone="warning">{release.releaseType}</Badge>}
                {current ? (
                  <Badge tone="accent">{t('content.currentVersion')}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={busy === release.id}
                    disabled={busy !== null || !file.source || release.downloadUrl === ''}
                    onClick={() => void install(release.id)}
                  >
                    {t('content.install')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
