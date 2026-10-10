import { useCallback, useState } from 'react'
import type { ProjectSummary } from '@shared/models'
import { useI18n } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useToast } from '@/state/toast'
import { ProviderBadge } from '@/components/Badges'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { ProjectIcon } from '@/components/ui/ProjectIcon'
import { PackPicker } from './PackPicker'
import { VersionPicker } from './VersionPicker'
import { isUnsupportedVersion, newestFirst } from './packLink'

/**
 * Connects a profile to a version of a modpack. Step one picks the pack, step two the version the
 * profile is on now. Nothing is installed: the backend only records the version.
 */
export function ConnectModpackDialog({
  profileId,
  onConnected,
  onClose
}: {
  profileId: string
  onConnected: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [chosen, setChosen] = useState<ProjectSummary | null>(null)
  const [selected, setSelected] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [problem, setProblem] = useState<{ message: string; unsupported: boolean } | null>(null)

  const loadVersions = useCallback(
    () => (chosen ? api.providers.versions(chosen.provider, chosen.id, {}) : Promise.resolve([])),
    [chosen]
  )
  const { data, error, loading, reload } = useAsync(loadVersions)
  // While a new pack loads, the previous pack's list and error must not show.
  const versions = newestFirst(loading ? [] : (data ?? []))
  const versionsError = loading ? null : error
  const selectedId = versions.some((version) => version.id === selected) ? selected : (versions[0]?.id ?? '')

  const pick = (pack: ProjectSummary): void => {
    setChosen(pack)
    setSelected('')
    setProblem(null)
  }

  const close = (): void => {
    if (!connecting) onClose()
  }

  const connect = async (): Promise<void> => {
    if (!chosen || !selectedId) return
    setConnecting(true)
    setProblem(null)
    try {
      await api.modpack.connect(profileId, { provider: chosen.provider, projectId: chosen.id, versionId: selectedId })
      toast.success(t('profile.modpack.connect.done', { name: chosen.name }))
      onConnected()
    } catch (failure) {
      setProblem({ message: errorMessage(failure), unsupported: isUnsupportedVersion(failure) })
      setConnecting(false)
    }
  }

  return (
    <Modal
      title={t('profile.modpack.connect.title')}
      onClose={close}
      wide
      footer={
        chosen ? (
          <>
            <Button variant="ghost" icon="lucide:arrow-left" disabled={connecting} onClick={() => setChosen(null)}>
              {t('profile.modpack.connect.back')}
            </Button>
            <Button variant="primary" icon="lucide:link" loading={connecting} disabled={!selectedId} onClick={() => void connect()}>
              {connecting ? t('profile.modpack.connect.submitting') : t('profile.modpack.connect.submit')}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
        )
      }
    >
      {chosen ? (
        <div className="grid min-w-0 gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <ProjectIcon url={chosen.iconUrl} />
            <div className="grid min-w-0 gap-1.5">
              <p className="truncate font-semibold">{chosen.name}</p>
              <div>
                <ProviderBadge provider={chosen.provider} />
              </div>
            </div>
          </div>
          <p className="text-muted">{t('profile.modpack.connect.versionHint')}</p>
          <VersionPicker
            versions={versions}
            loading={loading}
            error={versionsError}
            onRetry={reload}
            selectedId={selectedId}
            onSelect={setSelected}
          />
          {problem && <ErrorNotice message={problem.unsupported ? t('profile.modpack.connect.unsupported') : problem.message} />}
        </div>
      ) : (
        <PackPicker onPick={pick} />
      )}
    </Modal>
  )
}
