import { useCallback, useEffect, useRef, useState } from 'react'
import type { Job, Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { JobRow } from '@/components/JobRow'
import { useLaunchProfile } from '@/components/home/hooks/useLaunchProfile'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useGames, useLaunchBlock } from '@/state/games'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useSettings } from '@/state/settings'
import { useToast } from '@/state/toast'

const STATUS_POLL_MS = 3000

/** Profiles whose running game hid the launcher, with the timer that waits for the game to exit. */
const followedGames = new Map<string, ReturnType<typeof setInterval>>()

/**
 * Hides the launcher while the game of this profile runs and shows it again when the game exits.
 * It polls outside React, so the launcher comes back even when the profile page was left meanwhile.
 */
function followRunningGame(profileId: string): void {
  const volt = window.volt
  if (!volt || followedGames.has(profileId)) return
  void volt.hideWindow()
  const timer = setInterval(() => {
    api.game.status(profileId).then(
      (status) => {
        if (status.running) return
        clearInterval(timer)
        followedGames.delete(profileId)
        // Another profile's game may still hide the launcher; it comes back when the last one exits.
        if (followedGames.size === 0) void volt.showWindow()
      },
      () => undefined // keep waiting; the next tick tries again
    )
  }, STATUS_POLL_MS)
  followedGames.set(profileId, timer)
}

/** Play / install buttons plus the progress of the install or launch job started here. */
export function PlayControls({ profile, onChanged }: { profile: Profile; onChanged: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const { jobs, track } = useJobs()
  const launchGame = useLaunchProfile()
  const { settings } = useSettings()
  const { stop: stopGame } = useGames()
  const launchBlock = useLaunchBlock(profile.id)
  const loadStatus = useCallback(() => api.game.status(profile.id), [profile.id])
  const { data: game, reload: reloadStatus } = useAsync(loadStatus)
  const [jobIds, setJobIds] = useState<readonly string[]>([])
  const [starting, setStarting] = useState<'install' | 'launch' | 'stop' | null>(null)
  // Per profile: the launcher hides on launch unless the profile says otherwise (null = global setting).
  const hideOnLaunch = profile.hideLauncher ?? settings.closeOnLaunch
  // null until the first status answer, so a game that was already running when the page opened does not hide the launcher.
  const wasRunning = useRef<boolean | null>(null)

  useEffect(() => {
    const timer = setInterval(reloadStatus, STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [reloadStatus])

  // The game started while this page is open: hide the launcher.
  useEffect(() => {
    if (!game) return
    const previous = wasRunning.current
    wasRunning.current = game.running
    if (game.running && previous === false && hideOnLaunch) followRunningGame(profile.id)
  }, [game, hideOnLaunch, profile.id])

  useJobFinished((job) => {
    if (!jobIds.includes(job.id)) return
    if (job.state === 'failed') toast.error(job.error ?? job.title)
    // The launch job ends once the game process has been started.
    if (job.state === 'done' && job.kind === 'launch' && hideOnLaunch) {
      void api.game.status(profile.id).then((status) => {
        if (status.running) followRunningGame(profile.id)
      }, () => undefined)
    }
    reloadStatus()
    onChanged()
  })

  const ownJobs = jobs.filter((job) => jobIds.includes(job.id))
  const running = ownJobs.find((job) => job.state === 'running')
  const lastFinished = running ? undefined : ownJobs.find((job) => job.state === 'failed')
  const shown: Job | undefined = running ?? lastFinished

  const start = async (action: 'install' | 'launch'): Promise<void> => {
    setStarting(action)
    try {
      // The launch hook tracks its job itself; the install job is tracked here.
      const job = await (action === 'install' ? api.game.install(profile.id) : launchGame(profile.id))
      setJobIds((current) => [...current, job.id])
      if (action === 'install') track(job)
    } catch (error) {
      toast.error(error)
    } finally {
      setStarting(null)
    }
  }

  const stop = async (): Promise<void> => {
    setStarting('stop')
    try {
      await stopGame(profile.id)
      reloadStatus()
    } catch (error) {
      toast.error(error)
    } finally {
      setStarting(null)
    }
  }

  const busy = running !== undefined || starting !== null

  return (
    <div className="grid w-full gap-3 sm:w-auto sm:min-w-72">
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {game?.running ? (
          <>
            <Badge tone="success" icon="lucide:circle-play">
              {t('profile.game.running')}
            </Badge>
            <Button variant="danger" icon="lucide:square" loading={starting === 'stop'} onClick={() => void stop()}>
              {t('profile.game.stop')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              icon="lucide:download"
              disabled={busy}
              loading={starting === 'install'}
              onClick={() => void start('install')}
            >
              {t('profile.game.install')}
            </Button>
            <Button
              variant="launch"
              icon="lucide:play"
              disabled={busy || launchBlock.blocked}
              title={launchBlock.reason}
              loading={starting === 'launch'}
              onClick={() => void start('launch')}
            >
              {t('profile.game.play')}
            </Button>
          </>
        )}
      </div>
      {shown && <JobRow job={shown} />}
    </div>
  )
}
