import { Icon } from '@iconify/react'
import type { Job } from '@shared/models'
import { useI18n } from '@/i18n'
import { jobActivityLabel, jobProgress } from '@/lib/jobLabels'
import { ART_STYLE } from './profile/logo/ProfileLogo'
import { ProgressBar } from './ui/Feedback'

/**
 * Stand-in tile for a pack install whose profile does not exist yet (the archive is still downloading).
 * Same size as ProfileCard; the real card replaces it as soon as the job knows its profile.
 */
export function ProfilePlaceholderCard({ job, onCancel }: { job: Job; onCancel: (job: Job) => void }) {
  const { t } = useI18n()
  return (
    <div className="relative h-48" role="status" aria-label={job.title}>
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--accent-border)] bg-[var(--card-solid)]">
        <div className="h-[64px] shrink-0 animate-pulse border-b border-black/40" style={ART_STYLE} />
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 px-3 py-2.5">
          <h3 className="truncate text-[15.5px] leading-[1.35] font-semibold" title={job.title}>
            {job.title}
          </h3>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent">
            <Icon icon="lucide:loader-circle" className="size-3.5 animate-spin" />
            {t(jobActivityLabel(job.kind))}
          </span>
          <ProgressBar
            value={jobProgress(job)}
            label={job.title}
            showPercent
            caption={job.message || t('profiles.placeholder.preparing')}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onCancel(job)}
        aria-label={t('job.cancel')}
        title={t('job.cancel')}
        className="absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/70 backdrop-blur-sm transition-colors hover:text-white"
      >
        <Icon icon="lucide:x" className="size-4" />
      </button>
    </div>
  )
}
