import { useCallback, useMemo, useState } from 'react'
import type { ImportCandidate, ImportItem, Job } from '@shared/models'
import { useI18n } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobs } from '@/state/jobs'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { ImportLauncherGroup } from './ImportLauncherGroup'
import { importableItems, itemId } from './importModel'

/**
 * "Import profiles" from other launchers. Scans once, lets the user pick importable profiles,
 * starts one import job and closes. The job shows in the activity panel; the profiles page
 * reports the result when it finishes.
 */
export function ImportProfilesDialog({
  onClose,
  onStarted
}: {
  onClose: () => void
  /** Called with the started job and the number of profiles it copies. */
  onStarted: (job: Job, count: number) => void
}) {
  const { t } = useI18n()
  const jobs = useJobs()
  const load = useCallback(() => api.imports.scan(), [])
  const { data: scan, error, reload } = useAsync(load)

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const launchers = useMemo(() => scan?.launchers ?? [], [scan])
  const candidates = useMemo(() => importableItems(launchers), [launchers])
  // Derived from the scan, so a retry that drops a profile also drops it from the selection.
  const picked: ImportItem[] = useMemo(
    () => candidates.filter((item) => selected.has(itemId(item))),
    [candidates, selected]
  )
  const found = launchers.filter((launcher) => launcher.status === 'found' || launcher.status === 'unavailable')
  const notFound = launchers.filter((launcher) => launcher.status === 'none')
  const hasAnyProfile = launchers.some((launcher) => launcher.profiles.length > 0)

  const toggle = (launcherId: string, profile: ImportCandidate, checked: boolean): void => {
    const id = itemId({ launcher: launcherId, key: profile.key })
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const selectAll = (): void => setSelected(new Set(candidates.map(itemId)))
  const selectNone = (): void => setSelected(new Set())

  const start = async (): Promise<void> => {
    if (busy || picked.length === 0) return
    setBusy(true)
    setSubmitError(null)
    try {
      const job = await api.imports.start(picked)
      jobs.track(job)
      onStarted(job, picked.length)
      onClose()
    } catch (failure) {
      setSubmitError(errorMessage(failure))
      setBusy(false)
    }
  }

  const submitLabel = picked.length === 1 ? t('imports.submit.one') : t('imports.submit.many', { count: picked.length })

  return (
    <Modal
      title={t('imports.title')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon="lucide:download" loading={busy} disabled={picked.length === 0} onClick={() => void start()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13.5px] text-muted">{t('imports.lead')}</p>

        {error && <ErrorNotice message={error} onRetry={reload} />}
        {!scan && !error && <LoadingBlock label={t('imports.scan.loading')} />}

        {scan && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={selectAll} disabled={busy || candidates.length === 0}>
                  {t('imports.selectAll')}
                </Button>
                <Button variant="ghost" size="sm" onClick={selectNone} disabled={busy || picked.length === 0}>
                  {t('imports.selectNone')}
                </Button>
              </div>
              <span className="text-[13px] text-subtle tabular-nums" aria-live="polite">
                {t('imports.selectedCount', { count: picked.length })}
              </span>
            </div>

            {!hasAnyProfile && <p className="text-center text-muted">{t('imports.scan.none')}</p>}

            {found.length > 0 && (
              <div className="max-h-[min(50vh,28rem)] overflow-y-auto rounded-xl border border-line">
                {found.map((launcher) => (
                  <ImportLauncherGroup
                    key={launcher.id}
                    launcher={launcher}
                    selected={selected}
                    busy={busy}
                    onToggle={toggle}
                  />
                ))}
              </div>
            )}

            {notFound.length > 0 && (
              <p className="text-[12.5px] text-subtle">
                {t('imports.notFound', { names: notFound.map((launcher) => launcher.name).join(', ') })}
              </p>
            )}
          </>
        )}

        {submitError && <ErrorNotice message={submitError} />}
      </div>
    </Modal>
  )
}
