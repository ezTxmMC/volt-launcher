import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { ProfileListItem, RunningGame } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useJobFinished, useJobs } from './jobs'
import { useSettings } from './settings'
import { useToast } from './toast'

/** Polling while the panel is open or a game runs / starts, and the cheap idle rhythm. */
const FAST_POLL_MS = 3000
const IDLE_POLL_MS = 15000

export type GameEntryState = 'launching' | 'running' | 'stopping'

/** One row of the running-profiles lists: a running game, or a launch that is still being prepared. */
export interface GameEntry {
  profileId: string
  name: string
  state: GameEntryState
  /** ISO start of the game process; null while it is still being prepared. */
  startedAt: string | null
  /** The profile (version, loader, logo) when the profile list knows it. */
  profile: ProfileListItem | undefined
}

interface GamesValue {
  entries: readonly GameEntry[]
  /** Number of running games plus launches being prepared (top-bar badge). */
  count: number
  /** Several profiles may run at the same time (setting `multiProfile`). */
  multiProfile: boolean
  /** Name of the running profile that blocks the start of `profileId` (only with multiProfile off), else null. */
  blockedBy: (profileId: string) => string | null
  entryOf: (profileId: string) => GameEntry | undefined
  stop: (profileId: string) => Promise<void>
  stopAll: () => Promise<void>
  reload: () => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

const GamesContext = createContext<GamesValue | null>(null)

/**
 * The running games of all profiles (GET /api/games), the launches being prepared (jobs of kind
 * "launch") and the actions on them. Per-profile pages keep their own status; this is the overview.
 */
export function GamesProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const toast = useToast()
  const { jobs } = useJobs()
  const { settings } = useSettings()
  const multiProfile = settings.multiProfile !== false
  const [games, setGames] = useState<readonly RunningGame[]>([])
  const [profiles, setProfiles] = useState<readonly ProfileListItem[]>([])
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set())
  const [panelOpen, setPanelOpen] = useState(false)
  /** Profile id -> name of the games seen on the last poll; null until the first answer (no toast for the first look). */
  const previous = useRef<Map<string, string> | null>(null)
  /** Games the user stopped from the launcher: their exit is expected and gets no toast. */
  const stoppedHere = useRef(new Set<string>())

  const refresh = useCallback(async () => {
    const view = await api.games.list()
    const known = previous.current
    const nextIds = new Set(view.games.map((game) => game.profileId))
    if (known) {
      for (const [id, name] of known) {
        if (nextIds.has(id)) continue
        // A stop the user asked for here is no news; a game that ended by itself (quit, crash, stopped elsewhere) is.
        if (!stoppedHere.current.has(id)) toast.info(t('games.exited', { name }))
      }
    }
    for (const id of [...stoppedHere.current]) if (!nextIds.has(id)) stoppedHere.current.delete(id)
    previous.current = new Map(view.games.map((game) => [game.profileId, game.name]))
    setGames(view.games)
    setStopping((current) => {
      const kept = [...current].filter((id) => nextIds.has(id))
      return kept.length === current.size ? current : new Set(kept)
    })
  }, [toast, t])

  const reload = useCallback(() => {
    void refresh().catch(() => undefined)
  }, [refresh])

  const launching = useMemo(
    () => jobs.filter((job) => job.kind === 'launch' && job.state === 'running' && job.profileId !== null),
    [jobs]
  )
  const active = games.length + launching.length > 0
  const fast = active || panelOpen

  useEffect(() => {
    reload()
    const timer = window.setInterval(reload, fast ? FAST_POLL_MS : IDLE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [reload, fast])

  // A launch job that ended turned into a running game (or failed): look at once instead of waiting for the next tick.
  useJobFinished((job) => {
    if (job.kind === 'launch') reload()
  })

  // Names, versions and logos of the rows come from the profile list; load it again when the set of rows changes.
  const rowKey = [...games.map((game) => game.profileId), ...launching.map((job) => job.profileId)].join('|')
  useEffect(() => {
    if (rowKey === '') return
    let cancelled = false
    api.profiles.list().then(
      (list) => {
        if (!cancelled) setProfiles(list)
      },
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [rowKey])

  const entries = useMemo<GameEntry[]>(() => {
    const byId = new Map(profiles.map((profile) => [profile.id, profile]))
    const list: GameEntry[] = games.map((game) => ({
      profileId: game.profileId,
      name: byId.get(game.profileId)?.name ?? game.name,
      state: game.stopping || stopping.has(game.profileId) ? 'stopping' : 'running',
      startedAt: game.startedAt,
      profile: byId.get(game.profileId)
    }))
    const seen = new Set(list.map((entry) => entry.profileId))
    for (const job of launching) {
      const id = job.profileId
      if (id === null || seen.has(id)) continue
      seen.add(id)
      const profile = byId.get(id)
      list.push({
        profileId: id,
        name: profile?.name ?? job.title.replace(/^Starte\s+/, ''),
        state: 'launching',
        startedAt: null,
        profile
      })
    }
    return list
  }, [games, launching, profiles, stopping])

  const entryOf = useCallback((profileId: string) => entries.find((entry) => entry.profileId === profileId), [entries])

  const blockedBy = useCallback(
    (profileId: string): string | null => {
      if (multiProfile) return null
      return entries.find((entry) => entry.profileId !== profileId)?.name ?? null
    },
    [entries, multiProfile]
  )

  const stop = useCallback(
    async (profileId: string) => {
      stoppedHere.current.add(profileId)
      setStopping((current) => new Set([...current, profileId]))
      try {
        await api.game.stop(profileId)
      } catch (error) {
        stoppedHere.current.delete(profileId)
        setStopping((current) => new Set([...current].filter((id) => id !== profileId)))
        throw error
      }
      reload()
    },
    [reload]
  )

  const stopAll = useCallback(async () => {
    const ids = games.map((game) => game.profileId)
    for (const id of ids) stoppedHere.current.add(id)
    setStopping((current) => new Set([...current, ...ids]))
    try {
      const result = await api.games.stopAll()
      for (const id of result.stopped) stoppedHere.current.add(id)
    } catch (error) {
      for (const id of ids) stoppedHere.current.delete(id)
      setStopping(new Set())
      throw error
    }
    reload()
  }, [games, reload])

  const value = useMemo<GamesValue>(
    () => ({
      entries,
      count: entries.length,
      multiProfile,
      blockedBy,
      entryOf,
      stop,
      stopAll,
      reload,
      panelOpen,
      setPanelOpen
    }),
    [entries, multiProfile, blockedBy, entryOf, stop, stopAll, reload, panelOpen]
  )
  return <GamesContext.Provider value={value}>{children}</GamesContext.Provider>
}

export function useGames(): GamesValue {
  const value = useContext(GamesContext)
  if (!value) throw new Error('useGames must be used inside GamesProvider')
  return value
}

/** Whether a start of `profileId` is refused because another profile runs and several at once are switched off. */
export function useLaunchBlock(profileId: string): { blocked: boolean; reason: string | undefined } {
  const { t } = useI18n()
  const { blockedBy } = useGames()
  const other = blockedBy(profileId)
  return { blocked: other !== null, reason: other === null ? undefined : t('games.alreadyRunning', { name: other }) }
}
