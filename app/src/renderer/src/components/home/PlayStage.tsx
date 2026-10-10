import { type CSSProperties, useCallback, useEffect, useState } from 'react'
import type { Profile, ServerInfo } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { JobRow } from '@/components/JobRow'
import { useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { LaunchDock } from './LaunchDock'
import { QuickPlayStrip } from './QuickPlayStrip'
import { SkinViewer3D } from './SkinViewer3D'
import { launchFailureText, useLaunchProfile } from './hooks/useLaunchProfile'

const STATUS_POLL_MS = 3000

/** Soft gradient from the accent and secondary colour tokens; no image asset. */
const PANEL_BACKGROUND: CSSProperties = {
  background: [
    'radial-gradient(ellipse 65% 50% at 50% 38%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 72%)',
    'radial-gradient(ellipse 55% 45% at 100% 100%, color-mix(in srgb, var(--secondary) 22%, transparent), transparent 70%)',
    'linear-gradient(180deg, var(--surface-strong), var(--bg))'
  ].join(', ')
}

interface PlayStageProps {
  profiles: readonly Profile[]
  /** The profile to play; the stage is keyed by its id, so its launch state resets on a change. */
  profile: Profile
  accountName: string
  onSelect: (id: string) => void
}

/**
 * The home page's main panel: the account name, the current skin of the selected account as a 3D
 * figure in the middle, the launch dock at the bottom, and the quick-play strip of the profile's servers below.
 */
export function PlayStage({ profiles, profile, accountName, onSelect }: PlayStageProps) {
  const { t } = useI18n()
  const toast = useToast()
  const { jobs } = useJobs()
  const launchProfile = useLaunchProfile()

  const loadStatus = useCallback(() => api.game.status(profile.id), [profile.id])
  const { data: game, reload: reloadStatus } = useAsync(loadStatus)
  useEffect(() => {
    const timer = setInterval(reloadStatus, STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [reloadStatus])

  const loadServers = useCallback(() => api.saves.servers(profile.id), [profile.id])
  const servers = useAsync(loadServers)

  const [starting, setStarting] = useState(false)
  const [launchJobId, setLaunchJobId] = useState<string | null>(null)
  const launchJob = jobs.find((job) => job.id === launchJobId)

  const running = game?.running === true
  const launching = starting || launchJob?.state === 'running' || game?.phase === 'install-game' || game?.phase === 'launch'
  // Any other phase (stopping, verify, duplicate) also holds the profile.
  const busy = running || launching || (game !== undefined && game.phase !== 'idle')

  /** Starts the profile; with a server, the game joins that server (quick play). */
  const start = async (server?: ServerInfo): Promise<void> => {
    setStarting(true)
    try {
      const job = await launchProfile(profile.id, server ? { mode: 'multiplayer', server: server.address } : undefined)
      setLaunchJobId(job.id)
      toast.info(
        server
          ? t('quickPlay.launchStarted', { name: profile.name, server: server.name || server.address })
          : t('home.launchStarted', { name: profile.name })
      )
      reloadStatus()
    } catch (error) {
      toast.notify('error', launchFailureText(error, t('quickPlay.gameRunning')))
    } finally {
      setStarting(false)
    }
  }

  const title = running
    ? t('home.running')
    : launching
      ? t('home.starting')
      : t('home.launchVersion', { version: profile.minecraftVersion })

  return (
    <>
      <section
        aria-label={t('home.stage')}
        className="relative flex min-h-[460px] flex-1 flex-col items-center rounded-2xl border border-line"
      >
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-2xl" style={PANEL_BACKGROUND} />

        <div className="relative flex w-full flex-1 flex-col items-center justify-between gap-4 px-4 pt-5 pb-6 md:pt-7 md:pb-8">
          <p
            className="max-w-full truncate rounded-md border border-accent-line bg-surface-strong px-3.5 py-1 text-[15px] font-bold shadow-[var(--shadow-accent-md)]"
            title={accountName}
          >
            {accountName}
          </p>

          <SkinViewer3D />

          <LaunchDock
            profiles={profiles}
            profile={profile}
            title={title}
            busy={launching}
            disabled={busy}
            onLaunch={() => void start()}
            onSelect={onSelect}
            footer={launchJob && <JobRow job={launchJob} />}
          />
        </div>
      </section>

      <QuickPlayStrip
        servers={servers.data?.servers ?? []}
        loading={servers.loading}
        error={servers.error}
        disabled={busy}
        onLaunch={(server) => void start(server)}
      />
    </>
  )
}
