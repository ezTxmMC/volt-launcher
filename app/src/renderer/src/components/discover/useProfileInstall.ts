import { useCallback, useMemo, useState } from 'react'
import type { ContentKind, ContentType, ModFile, Profile, ProjectSummary } from '@shared/models'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'

/** The content folder a project kind installs into; modpacks create their own profile and have none. */
export const CONTENT_TYPE_OF: Partial<Record<ContentKind, ContentType>> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
  datapack: 'datapacks'
}

const keyOf = (provider: string, projectId: string): string => `${provider}:${projectId}`

export type InstallState = 'idle' | 'installing' | 'installed'

/** Folders whose files tell what the profile already has. Data packs are read per world (see below). */
const LISTED: readonly ContentType[] = ['mods', 'resourcepacks', 'shaderpacks']

/**
 * Installs projects straight into one profile and knows which projects it already has. The files of the
 * mods, resource packs and shader packs folders (and the chosen world's data packs) are read by their recorded
 * source, and again whenever an install job from here ends. Data packs need the world folder.
 */
export function useProfileInstall(
  profile: Profile | undefined,
  world?: string
): {
  stateOf: (project: ProjectSummary) => InstallState
  install: (project: ProjectSummary) => Promise<void>
  error: string | null
  reload: () => void
} {
  const { track } = useJobs()
  const toast = useToast()
  const profileId = profile?.id

  const load = useCallback(async (): Promise<ModFile[]> => {
    if (!profileId) return []
    const lists = await Promise.all(LISTED.map((type) => api.content.list(profileId, type)))
    if (world) lists.push(await api.content.list(profileId, 'datapacks', world))
    return lists.flat()
  }, [profileId, world])
  const { data, error, reload } = useAsync(load)
  // Project key -> install job id ('' while the job is being started).
  const [pending, setPending] = useState<ReadonlyMap<string, string>>(new Map())

  useJobFinished((job) => {
    const hit = [...pending.entries()].find(([, jobId]) => jobId === job.id)
    if (!hit) return
    setPending((current) => {
      const next = new Map(current)
      next.delete(hit[0])
      return next
    })
    reload()
  })

  const installed = useMemo(() => {
    const keys = new Set<string>()
    for (const file of data ?? []) if (file.source) keys.add(keyOf(file.source.provider, file.source.projectId))
    return keys
  }, [data])

  const stateOf = (project: ProjectSummary): InstallState => {
    const key = keyOf(project.provider, project.id)
    if (pending.has(key)) return 'installing'
    return installed.has(key) ? 'installed' : 'idle'
  }

  const install = async (project: ProjectSummary): Promise<void> => {
    if (!profile || !CONTENT_TYPE_OF[project.kind]) return
    const key = keyOf(project.provider, project.id)
    setPending((current) => new Map(current).set(key, ''))
    try {
      const job = await api.providers.installContent(profile.id, {
        provider: project.provider,
        projectId: project.id,
        kind: project.kind,
        withDependencies: true,
        world: project.kind === 'datapack' ? world : undefined
      })
      setPending((current) => new Map(current).set(key, job.id))
      track(job)
    } catch (failure) {
      setPending((current) => {
        const next = new Map(current)
        next.delete(key)
        return next
      })
      toast.error(failure)
    }
  }

  return { stateOf, install, error, reload }
}
