import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import type { Profile, ScreenshotInfo } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { useToast } from '@/state/toast'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Stagger } from '@/components/motion/Stagger'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, LoadingBlock, Spinner } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'

export function ScreenshotsPanel({ profile }: { profile: Profile }) {
  const { t, language } = useI18n()
  const toast = useToast()
  const load = useCallback(() => api.saves.screenshots(profile.id).then((result) => result.screenshots), [profile.id])
  const { data: shots, error, loading, reload } = useAsync(load)
  const [viewing, setViewing] = useState<ScreenshotInfo | null>(null)
  const [removing, setRemoving] = useState<ScreenshotInfo | null>(null)

  const openFolder = async (): Promise<void> => {
    try {
      const folder = await api.saves.openScreenshotFolder(profile.id)
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
      </div>

      {error && <ErrorNotice message={error} onRetry={reload} />}
      {!shots && loading && <LoadingBlock />}

      {shots && shots.length === 0 && (
        <EmptyState icon="lucide:image" title={t('saves.shots.empty.title')} description={t('saves.shots.empty.description')} />
      )}

      {shots && shots.length > 0 && (
        <Stagger as="ul" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {shots.map((shot) => (
            <li key={shot.fileName} className="group relative">
              <ShotThumb profileId={profile.id} shot={shot} onOpen={() => setViewing(shot)} />
              <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5 text-xs text-subtle">
                <span className="truncate" title={shot.fileName}>
                  {formatDate(shot.takenAt, language)}
                </span>
                <IconButton
                  icon="lucide:trash-2"
                  label={t('saves.shots.delete')}
                  className="size-6 border-transparent bg-transparent hover:text-danger"
                  onClick={() => setRemoving(shot)}
                />
              </div>
            </li>
          ))}
        </Stagger>
      )}

      {viewing && (
        <Modal title={viewing.fileName} onClose={() => setViewing(null)} wide>
          <div className="grid gap-4">
            <ShotImage profileId={profile.id} shot={viewing} className="max-h-[70vh] w-full object-contain" />
            <div className="flex justify-end">
              <Button
                variant="danger"
                icon="lucide:trash-2"
                onClick={() => {
                  setRemoving(viewing)
                  setViewing(null)
                }}
              >
                {t('saves.shots.delete')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {removing && (
        <ConfirmModal
          title={t('saves.shots.deleteTitle')}
          message={t('saves.shots.deleteMessage', { name: removing.fileName })}
          confirmLabel={t('saves.shots.delete')}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await api.saves.deleteScreenshot(profile.id, removing.fileName)
            reload()
            toast.success(t('saves.deleted'))
          }}
        />
      )}
    </div>
  )
}

/** Loads one image when its tile scrolls into view; the API answers with a data URL. */
function useShotSource(profileId: string, shot: ScreenshotInfo, enabled: boolean): { src: string | null; failed: boolean } {
  const [state, setState] = useState<{ key: string; src: string | null; failed: boolean }>({
    key: '',
    src: null,
    failed: false
  })
  const key = `${profileId}/${shot.fileName}`

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    api.saves.screenshotImage(profileId, shot.fileName).then(
      (result) => {
        if (!cancelled) setState({ key, src: result.dataUrl, failed: false })
      },
      () => {
        if (!cancelled) setState({ key, src: null, failed: true })
      }
    )
    return () => {
      cancelled = true
    }
  }, [enabled, key, profileId, shot.fileName])

  return state.key === key ? { src: state.src, failed: state.failed } : { src: null, failed: false }
}

function ShotThumb({ profileId, shot, onOpen }: { profileId: string; shot: ScreenshotInfo; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { src, failed } = useShotSource(profileId, shot, visible)
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={shot.fileName}
      className="grid aspect-video w-full place-items-center overflow-hidden rounded-lg border border-line bg-surface-3 transition-all duration-200 hover:border-[var(--accent-border)]"
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : failed ? (
        <span className="flex flex-col items-center gap-1 text-xs text-subtle">
          <Icon icon="lucide:circle-alert" className="size-5" />
          {t('saves.shots.loadFailed')}
        </span>
      ) : (
        <Spinner className="size-5" />
      )}
    </button>
  )
}

function ShotImage({ profileId, shot, className }: { profileId: string; shot: ScreenshotInfo; className: string }) {
  const { src, failed } = useShotSource(profileId, shot, true)
  if (src) return <img src={src} alt={shot.fileName} className={className} />
  if (failed) return <ErrorNotice message={shot.fileName} />
  return <LoadingBlock />
}
