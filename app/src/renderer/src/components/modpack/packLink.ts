import type { ModpackStatus, ProjectVersion, ProviderId } from '@shared/models'

/** The pack a profile is connected to, read from either response shape of the modpack status. */
export interface PackLink {
  provider: ProviderId
  projectId: string
  versionId: string
  name: string
  versionNumber: string
}

/**
 * Flat fields of a linked profile (the connect contract) win; `modpack` is the older shape.
 * Null when the profile is not linked.
 */
export function packLinkOf(status: ModpackStatus | undefined): PackLink | null {
  if (!status) return null
  const source = status.modpack ?? null
  const linked = status.linked ?? source !== null
  if (!linked) return null
  const provider = status.provider ?? source?.provider
  if (!provider) return null
  return {
    provider,
    projectId: status.projectId ?? source?.projectId ?? '',
    versionId: status.versionId ?? source?.versionId ?? '',
    name: status.name ?? source?.name ?? '',
    versionNumber: status.versionNumber ?? ''
  }
}

/** Newest release first; releases without a usable date keep their order at the end. */
export function newestFirst(versions: readonly ProjectVersion[]): ProjectVersion[] {
  const time = (version: ProjectVersion): number => {
    const value = Date.parse(version.datePublished)
    return Number.isNaN(value) ? -Infinity : value
  }
  return [...versions].sort((a, b) => time(b) - time(a))
}

/** Arrow keys of a radio group as a step: 1 forward, -1 back, 0 for any other key. */
export function stepOf(key: string): 1 | -1 | 0 {
  if (key === 'ArrowDown' || key === 'ArrowRight') return 1
  if (key === 'ArrowUp' || key === 'ArrowLeft') return -1
  return 0
}

/**
 * The backend answers 422 when the provider cannot read the file list of a version. The preload
 * drops the HTTP status and rethrows only the message, so the status is recognised by its code in the text.
 */
export function isUnsupportedVersion(problem: unknown): boolean {
  // The preload bridge puts the HTTP status on the error (see preload/index.ts).
  return typeof problem === 'object' && problem !== null && (problem as { status?: unknown }).status === 422
}
