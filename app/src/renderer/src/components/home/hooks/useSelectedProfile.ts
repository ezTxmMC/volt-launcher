import { useCallback, useState } from 'react'
import type { Profile } from '@shared/models'

/** The profile picked on the home page; kept per device, like the language and the theme. */
const STORAGE_KEY = 'volt.home.profile'

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null // storage unavailable: fall back to the default choice
  }
}

function writeStoredId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // storage unavailable: the choice lasts for this session only
  }
}

/**
 * The stored profile if it still exists, else the most recently played one, else the first one.
 * Exported for tests and for callers that have the list but no hook state.
 */
export function pickProfile(profiles: readonly Profile[], storedId: string | null): Profile | undefined {
  const stored = profiles.find((profile) => profile.id === storedId)
  if (stored) return stored
  const played = profiles
    .filter((profile): profile is Profile & { lastPlayed: string } => profile.lastPlayed !== null)
    .sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed))
  return played[0] ?? profiles[0]
}

/** The profile the home page plays, and a setter that remembers the choice on this device. */
export function useSelectedProfile(
  profiles: readonly Profile[] | undefined
): [Profile | undefined, (id: string) => void] {
  const [storedId, setStoredId] = useState<string | null>(readStoredId)
  const choose = useCallback((id: string) => {
    writeStoredId(id)
    setStoredId(id)
  }, [])
  const selected = profiles ? pickProfile(profiles, storedId) : undefined
  return [selected, choose]
}
