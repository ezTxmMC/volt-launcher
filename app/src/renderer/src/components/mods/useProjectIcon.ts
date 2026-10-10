import { useEffect, useState } from 'react'
import type { ProjectDetail, ProviderId } from '@shared/models'
import { api } from '@/lib/api'

/** Icon URL per `provider:projectId` for the rest of the session. A project without an icon caches null. */
const resolved = new Map<string, string | null>()
/** Requests still running, so rows that mount together share one call. */
const running = new Map<string, Promise<string | null>>()

const keyOf = (provider: ProviderId, projectId: string): string => `${provider}:${projectId}`

/**
 * The icon URL of a project, from the project detail call. Every caller shares the cache and the
 * in-flight request, so a list of 20 mods asks once per project. Failures resolve to null (the
 * placeholder) and are not cached, so a later mount can try again.
 */
export function loadProjectIcon(provider: ProviderId, projectId: string): Promise<string | null> {
  const key = keyOf(provider, projectId)
  const known = resolved.get(key)
  if (known !== undefined) return Promise.resolve(known)
  const inFlight = running.get(key)
  if (inFlight) return inFlight

  const request = new Promise<ProjectDetail>((resolve) => resolve(api.providers.project(provider, projectId)))
    .then(
      (project) => {
        const url = project.iconUrl || null
        resolved.set(key, url)
        return url
      },
      () => null
    )
    .finally(() => {
      running.delete(key)
    })
  running.set(key, request)
  return request
}

/** The icon URL of a project, or null while it loads, when it has none, or when the lookup failed. */
export function useProjectIcon(provider: ProviderId | null | undefined, projectId: string | null | undefined): string | null {
  const key = provider && projectId ? keyOf(provider, projectId) : null
  const [settled, setSettled] = useState<{ key: string; url: string | null } | null>(null)

  useEffect(() => {
    if (!provider || !projectId || resolved.has(keyOf(provider, projectId))) return
    const ownKey = keyOf(provider, projectId)
    let active = true
    void loadProjectIcon(provider, projectId).then((url) => {
      if (active) setSettled({ key: ownKey, url })
    })
    return () => {
      active = false
    }
  }, [provider, projectId])

  if (key === null) return null
  if (resolved.has(key)) return resolved.get(key) ?? null
  return settled?.key === key ? settled.url : null
}
