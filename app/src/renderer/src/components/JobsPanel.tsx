import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import type { Job } from '@shared/models'
import { useI18n } from '@/i18n'
import { useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { JobRow } from './JobRow'

/** Top-bar button with a popover listing running and recent jobs. */
export function JobsButton() {
  const { t } = useI18n()
  const { jobs, runningCount, cancel, clearFinished, dismiss } = useJobs()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent): void => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onCancel = (job: Job): void => {
    cancel(job.id).catch((error: unknown) => toast.error(error))
  }

  const hasFinished = jobs.some((job) => job.state !== 'running')

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t('jobs.title')}
        aria-label={t('jobs.title')}
        className="relative grid size-8 place-items-center rounded-full border border-line bg-surface-3 text-subtle transition-all duration-200 hover:bg-line hover:text-fg"
      >
        <Icon icon="lucide:bell" className={`size-[15px] ${runningCount > 0 ? 'text-accent' : ''}`} />
        {runningCount > 0 && (
          <span className="absolute -top-[3px] -right-[3px] flex size-4 items-center justify-center rounded-full bg-accent text-[9px] leading-none font-bold text-white shadow-[var(--shadow-accent-md)]">
            {runningCount > 9 ? '9+' : runningCount}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label={t('jobs.title')}
          className="app-no-drag fixed inset-x-3 top-14 z-40 flex max-h-[70vh] flex-col overflow-hidden rounded-lg border border-white/10 bg-header shadow-pop backdrop-blur-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[340px] sm:origin-top-right"
        >
          <header className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2.5">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold">{t('jobs.title')}</h2>
              {runningCount > 0 && <p className="text-[11px] text-accent">{t('jobs.running', { n: runningCount })}</p>}
            </div>
            {hasFinished && (
              <button type="button" onClick={clearFinished} className="text-[11px] text-subtle transition-colors hover:text-muted">
                {t('jobs.clear')}
              </button>
            )}
          </header>
          <div className="max-h-[320px] overflow-y-auto px-3">
            {jobs.length === 0 ? (
              <p className="px-2 py-6 text-center text-[15px] text-fg/30">{t('jobs.empty')}</p>
            ) : (
              jobs.slice(0, 30).map((job) => (
                <JobRow key={job.id} job={job} onCancel={onCancel} onDismiss={(finished) => dismiss(finished.id)} />
              ))
            )}
          </div>
        </section>
      )}
    </div>
  )
}
