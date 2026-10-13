import type { Job } from '@shared/models'
import { api, errorMessage } from '@/lib/api'
import { summarizeSyncJob } from '@/lib/syncResult'
import type { SyncApplySummary } from '@/lib/syncResult'

const POLL_MS = 500
const MAX_WAIT_MS = 30 * 60_000

/**
 * Waits until a job leaves the running state and answers its final record (undefined when the job vanished
 * from the list). Polls the job list, so it also works outside any component.
 */
export async function waitForJob(id: string): Promise<Job | undefined> {
  const deadline = Date.now() + MAX_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    const job = (await api.jobs.list()).find((entry) => entry.id === id)
    if (!job || job.state !== 'running') return job
  }
  return undefined
}

/**
 * Links the packs to a new profile one after another. A profile is busy while a link installs (the backend
 * answers 409), so each job is awaited before the next pack is linked. Runs outside any component, so it keeps
 * going after the wizard has closed; failures are thrown to the caller.
 */
export async function linkSyncPacks(profileId: string, packIds: readonly string[], track: (job: Job) => void): Promise<void> {
  for (const packId of packIds) {
    const job = await api.profiles.syncPacks.link(profileId, packId)
    track(job)
    await waitForJob(job.id)
  }
}

/** The outcome of linking one pack to one profile. */
export interface LinkOutcome {
  profileId: string
  /** Set when the link job finished; null when it could not be started or failed. */
  summary: SyncApplySummary | null
  error: string | null
}

/**
 * Links one pack to several profiles one after another and reports each outcome as it arrives. One profile
 * failing (busy, game running) does not stop the others.
 */
export async function linkPackToProfiles(
  packId: string,
  profileIds: readonly string[],
  track: (job: Job) => void,
  onOutcome: (outcome: LinkOutcome, done: number, total: number) => void
): Promise<LinkOutcome[]> {
  const outcomes: LinkOutcome[] = []
  for (const profileId of profileIds) {
    let outcome: LinkOutcome
    try {
      const started = await api.profiles.syncPacks.link(profileId, packId)
      track(started)
      const finished = await waitForJob(started.id)
      if (finished?.state === 'failed') {
        outcome = { profileId, summary: null, error: finished.error ?? finished.title }
      } else {
        const summary = finished ? summarizeSyncJob(finished) : null
        outcome = { profileId, summary: summary?.applies[0] ?? null, error: null }
      }
    } catch (error) {
      outcome = { profileId, summary: null, error: errorMessage(error) }
    }
    outcomes.push(outcome)
    onOutcome(outcome, outcomes.length, profileIds.length)
  }
  return outcomes
}
