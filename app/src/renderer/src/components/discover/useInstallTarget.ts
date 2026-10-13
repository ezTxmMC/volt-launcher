import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

const KEY = 'volt.discover.target'

// Session storage can be unavailable (private windows, blocked site data); the choice then lasts for the page only.
export function readLastTarget(): string {
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberTarget(profileId: string): void {
  try {
    if (profileId) sessionStorage.setItem(KEY, profileId)
    else sessionStorage.removeItem(KEY)
  } catch {
    // storage unavailable: the choice lasts for this visit only
  }
}

/**
 * The profile that Discover and the project page install into. A deep link (`?profile=<id>`) wins; otherwise
 * the profile chosen last in this session. Choosing writes both, so the target survives navigation.
 */
export function useInstallTarget(): [string, (profileId: string) => void] {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('profile') ?? ''
  const [stored, setStored] = useState(readLastTarget)
  const target = fromUrl || stored

  // A deep link becomes the session's choice.
  useEffect(() => {
    if (fromUrl) rememberTarget(fromUrl)
  }, [fromUrl])

  const choose = useCallback(
    (profileId: string) => {
      rememberTarget(profileId)
      setStored(profileId)
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (profileId) next.set('profile', profileId)
          else next.delete('profile')
          return next
        },
        { replace: true }
      )
    },
    [setParams]
  )
  return [target, choose]
}
