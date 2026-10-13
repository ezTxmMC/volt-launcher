import type { Job } from '@shared/models'

/** What one apply of a pack to one profile did (the job result of a link, or one entry of a sync). */
export interface SyncApplySummary {
  profileId: string | null
  packId: string | null
  /** Names of the entries that were installed. */
  installed: string[]
  /** Names of the entries the profile already had (its own copy wins). */
  overridden: string[]
  /** Names of the entries that left the pack and were removed. */
  removed: string[]
  /** Why entries were not installed, as the backend words it. */
  skipped: string[]
}

/** The result of a `syncpack` job, summed up. */
export interface SyncJobSummary {
  applies: SyncApplySummary[]
  /** Profiles a sync skipped because they were busy or the game ran. */
  busyProfiles: string[]
  installed: number
  overridden: number
  removed: number
  skipped: string[]
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []

function applyOf(raw: unknown): SyncApplySummary | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  return {
    profileId: typeof row['profileId'] === 'string' ? row['profileId'] : null,
    packId: typeof row['packId'] === 'string' ? row['packId'] : null,
    installed: strings(row['installed']),
    overridden: strings(row['overridden']),
    removed: strings(row['removed']),
    skipped: strings(row['skipped'])
  }
}

/** Sums up several applies (for example the links of one pack to several profiles). */
export function combineApplies(applies: readonly SyncApplySummary[], busyProfiles: string[] = []): SyncJobSummary {
  return {
    applies: [...applies],
    busyProfiles,
    installed: applies.reduce((sum, apply) => sum + apply.installed.length, 0),
    overridden: applies.reduce((sum, apply) => sum + apply.overridden.length, 0),
    removed: applies.reduce((sum, apply) => sum + apply.removed.length, 0),
    skipped: applies.flatMap((apply) => apply.skipped)
  }
}

/**
 * Reads the result of a finished link or sync job. A link answers one apply
 * (`{profileId, packId, installed, overridden, removed, skipped}`), a sync answers
 * `{packId, profiles: [apply...], skipped: [profileId...]}`. Anything else gives null.
 */
export function summarizeSyncJob(job: Job): SyncJobSummary | null {
  const result = job.result
  if (!result) return null
  if (Array.isArray(result['profiles'])) {
    const applies = result['profiles'].flatMap((row) => applyOf(row) ?? [])
    return combineApplies(applies, strings(result['skipped']))
  }
  const single = applyOf(result)
  return single ? combineApplies([single]) : null
}

/** True when the summary has something worth telling the user. */
export function hasOutcome(summary: SyncJobSummary): boolean {
  return (
    summary.installed + summary.overridden + summary.removed + summary.skipped.length + summary.busyProfiles.length > 0
  )
}
