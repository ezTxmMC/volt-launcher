import { useEffect, useState } from 'react'
import type { Profile, ProfileLogo } from '@shared/models'
import { api } from '@/lib/api'

/**
 * `loading`: the answer is not known yet (show the loader badge). `ready`: `logo` is the answer.
 * `unavailable`: the endpoint is missing (404 on older backends) or failed; show the old card look.
 */
export type ProfileLogoStatus = 'loading' | 'ready' | 'unavailable'

export interface ProfileLogoResult {
  status: ProfileLogoStatus
  logo: ProfileLogo | null
}

interface Resolved {
  /** The inputs the answer was fetched for (see `signatureOf`). */
  signature: string
  /** null when the endpoint could not answer. */
  logo: ProfileLogo | null
}

/** Answers per profile id, kept for the whole session (a refetch happens only when the signature changes). */
const resolved = new Map<string, Resolved>()
/** Requests still running, per profile id, so cards that mount together share one request. */
const inflight = new Map<string, { signature: string; promise: Promise<ProfileLogo | null> }>()

/**
 * Everything the backend's logo answer can depend on: the chosen icon, the linked modpack, the game
 * version and the loader. When one of them changes, the logo is fetched again.
 */
function signatureOf(profile: Profile): string {
  const source = profile.source ? `${profile.source.provider}/${profile.source.projectId}/${profile.source.versionId}` : ''
  return [profile.iconUrl ?? '', source, profile.minecraftVersion, profile.loader].join('\n')
}

function fetchLogo(id: string, signature: string): Promise<ProfileLogo | null> {
  const known = resolved.get(id)
  if (known && known.signature === signature) return Promise.resolve(known.logo)
  const running = inflight.get(id)
  if (running && running.signature === signature) return running.promise

  const request = api.profiles.logo(id).then(
    (logo) => logo,
    // Older backends answer 404 here: keep the old card look and do not ask again this session.
    () => null
  )
  const promise = request.then((logo) => {
    resolved.set(id, { signature, logo })
    if (inflight.get(id)?.promise === promise) inflight.delete(id)
    return logo
  })
  inflight.set(id, { signature, promise })
  return promise
}

/**
 * The logo of one profile. Fetched once per profile id per session and refetched when the icon, the
 * modpack link, the Minecraft version or the loader changes. Never blocks: while the answer is
 * pending the status is `loading` and the caller draws the loader badge.
 */
export function useProfileLogo(profile: Profile): ProfileLogoResult {
  const { id } = profile
  const signature = signatureOf(profile)
  // Only a re-render trigger: the answer itself lives in `resolved`.
  const [, setRevision] = useState(0)

  useEffect(() => {
    if (resolved.get(id)?.signature === signature) return
    let active = true
    void fetchLogo(id, signature).then(() => {
      if (active) setRevision((value) => value + 1)
    })
    return () => {
      active = false
    }
  }, [id, signature])

  const known = resolved.get(id)
  if (!known || known.signature !== signature) return { status: 'loading', logo: null }
  return known.logo ? { status: 'ready', logo: known.logo } : { status: 'unavailable', logo: null }
}
