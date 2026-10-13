import type { GamePhase, Job } from '@shared/models'
import type { MessageKey } from '@/i18n'

/** Short "what is happening" label of a running job, shown on profile cards. */
export function jobActivityLabel(kind: string): MessageKey {
  switch (kind) {
    case 'pack-install':
    case 'pack-import':
    case 'install-game':
    case 'content-install':
    case 'import':
      return 'profiles.job.installing'
    case 'pack-update':
      return 'profiles.job.updating'
    case 'launch':
      return 'profiles.job.starting'
    case 'profile-verify':
      return 'profiles.job.verifying'
    case 'profile-duplicate':
      return 'profiles.job.copying'
    case 'syncpack':
      return 'profiles.job.syncing'
    default:
      return 'profiles.job.working'
  }
}

/** Label for a busy phase without a job at hand. */
export function phaseActivityLabel(phase: GamePhase): MessageKey | null {
  switch (phase) {
    case 'install-game':
      return 'profiles.job.installing'
    case 'launch':
      return 'profiles.job.starting'
    case 'verify':
      return 'profiles.job.verifying'
    case 'duplicate':
      return 'profiles.job.copying'
    default:
      return null
  }
}

/** Progress of a job for a ProgressBar: null (indeterminate) while nothing is known yet. */
export function jobProgress(job: Pick<Job, 'progress'> | undefined): number | null {
  return job && job.progress > 0 ? job.progress : null
}
