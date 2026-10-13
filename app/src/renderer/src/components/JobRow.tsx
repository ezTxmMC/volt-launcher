import { Icon } from '@iconify/react'
import type { Job, JobState } from '@shared/models'
import { useI18n } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { formatRelative } from '@/lib/format'
import { ProgressBar } from './ui/Feedback'

/** Old TaskCenter item: state badge circle, title, progress line and state caption. */
const STATE_STYLE: Record<JobState, { icon: string; circle: string; label: MessageKey }> = {
  running: { icon: 'lucide:loader-circle', circle: 'bg-accent/15 text-accent', label: 'job.state.running' },
  done: { icon: 'lucide:check', circle: 'bg-success-soft text-success', label: 'job.state.done' },
  failed: { icon: 'lucide:x', circle: 'bg-danger/15 text-danger', label: 'job.state.failed' },
  cancelled: { icon: 'lucide:minus', circle: 'bg-white/10 text-subtle', label: 'job.state.cancelled' }
}

export function JobRow({
  job,
  onCancel,
  onDismiss
}: {
  job: Job
  onCancel?: (job: Job) => void
  onDismiss?: (job: Job) => void
}) {
  const { t, language } = useI18n()
  const state = STATE_STYLE[job.state]
  const running = job.state === 'running'
  const caption = job.state === 'failed' && job.error ? job.error : job.message || t(state.label)
  return (
    <div className="group flex flex-col gap-2 border-b border-white/5 py-2.5 last:border-0">
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${state.circle}`} aria-label={t(state.label)}>
          <Icon icon={state.icon} className={`size-3 ${running ? 'animate-spin' : ''}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] leading-snug text-fg/80" title={job.title}>
            {job.title}
          </p>
          <p className={`truncate text-[11px] ${job.state === 'failed' ? 'text-danger-text' : 'text-subtle'}`}>
            {caption}
            {!running && job.finishedAt && !job.message && <> · {formatRelative(job.finishedAt, language)}</>}
          </p>
        </div>
        {running && onCancel && (
          <button
            type="button"
            onClick={() => onCancel(job)}
            className="mt-0.5 grid size-4 shrink-0 place-items-center rounded text-fg/20 transition-all hover:text-fg/60"
            aria-label={t('job.cancel')}
            title={t('job.cancel')}
          >
            <Icon icon="lucide:x" className="size-3" />
          </button>
        )}
        {!running && onDismiss && (
          <button
            type="button"
            onClick={() => onDismiss(job)}
            className="mt-0.5 grid size-4 shrink-0 place-items-center rounded text-fg/20 opacity-0 transition-all group-hover:opacity-100 hover:text-fg/60 focus-visible:opacity-100"
            aria-label={t('jobs.dismiss')}
            title={t('jobs.dismiss')}
          >
            <Icon icon="lucide:x" className="size-3" />
          </button>
        )}
      </div>
      {running && <ProgressBar value={job.progress > 0 ? job.progress : null} label={job.title} showPercent />}
    </div>
  )
}
