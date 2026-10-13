import { useCallback, useEffect } from 'react'
import type { Job, QuickPlay } from '@shared/models'
import { api, errorMessage } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobs } from '@/state/jobs'

const STATUS_POLL_MS = 3000

/**
 * Starts the launch job of a profile and registers it in the activity list. The backend's launch
 * job installs the game first when needed, then starts it. Shared by the home page, the profile
 * play controls and the quick-join buttons. With `quickPlay` the game starts straight into that
 * server or world. Errors are thrown; the caller reports them (see launchFailureText).
 */
export function useLaunchProfile(): (profileId: string, quickPlay?: QuickPlay) => Promise<Job> {
  const { track } = useJobs()
  return useCallback(
    async (profileId: string, quickPlay?: QuickPlay) => {
      const job = await api.game.launch(profileId, quickPlay)
      track(job)
      return job
    },
    [track]
  )
}

/**
 * Polls the game status of a profile. `busy` while the game runs or another game phase (install,
 * launch, stop) is active; `reload` asks for a fresh status at once.
 */
export function useGameBusy(profileId: string): { busy: boolean; reload: () => void } {
  const load = useCallback(() => api.game.status(profileId), [profileId])
  const { data: game, reload } = useAsync(load)
  useEffect(() => {
    const timer = setInterval(reload, STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [reload])
  return { busy: game !== undefined && (game.running || game.phase !== 'idle'), reload }
}

/**
 * Text of a failed launch for a toast: the backend's message, including 409 (it names the running
 * profile when several at once are switched off), 400, 404 and 422. `runningText` is the fallback
 * for a 409 that came without a message.
 */
export function launchFailureText(error: unknown, runningText: string): string {
  const message = errorMessage(error).trim()
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
  return status === 409 && message === '' ? runningText : message
}
