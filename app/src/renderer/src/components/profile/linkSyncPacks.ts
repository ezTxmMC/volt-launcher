import type { Job } from '@shared/models'
import { api } from '@/lib/api'

const POLL_MS = 500
const MAX_WAIT_MS = 30 * 60_000

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

async function waitForJob(id: string): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    const job = (await api.jobs.list()).find((entry) => entry.id === id)
    if (!job || job.state !== 'running') return
  }
}
