import { useCallback, useState } from 'react'
import type { Profile } from '@shared/models'

/**
 * The profile picked on the home page, with the time of the pick; kept per device, like the language and the theme.
 * A pick is only honoured until another profile is launched: the home page follows the last profile started.
 */
const STORAGE_KEY = 'volt.home.profile'

interface Pick {
  id: string
  /** ISO time of the pick ("" for a pick stored by an older version: it never outranks a launch). */
  at: string
}

function readStoredPick(): Pick | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<Pick>
      return typeof parsed.id === 'string' ? { id: parsed.id, at: typeof parsed.at === 'string' ? parsed.at : '' } : null
    }
    return { id: raw, at: '' }
  } catch {
    return null // storage unavailable: fall back to the default choice
  }
}

function writeStoredPick(pick: Pick): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pick))
  } catch {
    // storage unavailable: the choice lasts for this session only
  }
}

/**
 * The profile to show: the one picked on the home page, unless a profile was launched after the pick (then the
 * most recently played one); without a pick the most recently played, else the first one.
 * Exported for tests and for callers that have the list but no hook state.
 */
export function pickProfile(profiles: readonly Profile[], pick: Pick | null): Profile | undefined {
  const played = profiles
    .filter((profile): profile is Profile & { lastPlayed: string } => profile.lastPlayed !== null)
    .sort((a, b) => Date.parse(b.lastPlayed) - Date.parse(a.lastPlayed))
  const latest = played[0]
  const picked = pick ? profiles.find((profile) => profile.id === pick.id) : undefined
  if (picked && (!latest || Date.parse(pick!.at || '1970-01-01T00:00:00Z') > Date.parse(latest.lastPlayed))) return picked
  return latest ?? picked ?? profiles[0]
}

/** The profile the home page plays, and a setter that remembers the choice on this device. */
export function useSelectedProfile(
  profiles: readonly Profile[] | undefined
): [Profile | undefined, (id: string) => void] {
  const [pick, setPick] = useState<Pick | null>(readStoredPick)
  const choose = useCallback((id: string) => {
    const next = { id, at: new Date().toISOString() }
    writeStoredPick(next)
    setPick(next)
  }, [])
  const selected = profiles ? pickProfile(profiles, pick) : undefined
  return [selected, choose]
}
