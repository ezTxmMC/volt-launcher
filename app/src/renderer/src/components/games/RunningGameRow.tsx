import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '@iconify/react'
import { useI18n } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { formatClock } from '@/lib/format'
import { LOADER_NAMES } from '@/lib/labels'
import { type GameEntry, type GameEntryState, useGames } from '@/state/games'
import { useToast } from '@/state/toast'
import { ProfileAvatar } from '@/components/ProfileCard'
import { ART_STYLE, ProfileLogo } from '@/components/profile/logo/ProfileLogo'
import { Button } from '@/components/ui/Button'

const STATE_LABEL: Record<GameEntryState, MessageKey> = {
  running: 'games.state.running',
  stopping: 'games.state.stopping',
  launching: 'games.state.launching'
}

/** Seconds since `startedAt`, ticking once a second; null when the game has not started yet. */
export function useUptime(startedAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === null) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  if (startedAt === null) return null
  const start = Date.parse(startedAt)
  return Number.isNaN(start) ? null : Math.max(0, Math.floor((now - start) / 1000))
}

/**
 * One running profile: logo, name (opens the profile), version and loader, state with the live running
 * time, and the Stop and Logs buttons. Used by the top-bar panel and by the strip of the profiles page.
 */
export function RunningGameRow({
  entry,
  compact = false,
  onNavigate
}: {
  entry: GameEntry
  compact?: boolean
  /** Called when the row navigates away (the panel closes itself). */
  onNavigate?: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { stop } = useGames()
  const uptime = useUptime(entry.startedAt)
  const profile = entry.profile
  const meta = profile ? `${profile.minecraftVersion} ${LOADER_NAMES[profile.loader] ?? profile.loader}` : null
  const logoSize = compact ? 'size-9' : 'size-10'
  const stopDisabled = entry.state !== 'running'

  return (
    <div className={`flex items-center gap-2.5 ${compact ? 'py-1.5' : 'border-b border-white/5 py-2.5 last:border-0'}`}>
      <span className={`relative ${logoSize} shrink-0 overflow-hidden rounded-lg`} style={ART_STYLE} aria-hidden="true">
        {profile ? (
          <ProfileLogo profile={profile} />
        ) : (
          <ProfileAvatar name={entry.name} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <Link
          to={`/profiles/${entry.profileId}`}
          onClick={onNavigate}
          title={t('games.openProfile', { name: entry.name })}
          className="block truncate text-[14px] leading-snug font-semibold text-fg/90 transition-colors hover:text-accent"
        >
          {entry.name}
        </Link>
        <p className="flex min-w-0 items-center gap-1.5 truncate text-[11.5px] text-subtle">
          <span
            className={`inline-flex shrink-0 items-center gap-1 font-semibold ${
              entry.state === 'running' ? 'text-success' : 'text-accent'
            }`}
          >
            {entry.state === 'running' ? (
              <span className="size-1.5 rounded-full bg-success" />
            ) : (
              <Icon icon="lucide:loader-circle" className="size-3 animate-spin" />
            )}
            {t(STATE_LABEL[entry.state])}
          </span>
          {uptime !== null && <span className="shrink-0 tabular-nums">{formatClock(uptime)}</span>}
          {meta && <span className="truncate">· {meta}</span>}
        </p>
      </div>
      {entry.state !== 'launching' && (
        <Link
          to={`/profiles/${entry.profileId}/saves?tab=logs`}
          onClick={onNavigate}
          title={t('games.logs')}
          aria-label={`${t('games.logs')}: ${entry.name}`}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] border border-transparent px-2 text-[12px] font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <Icon icon="lucide:file-text" className="size-3.5" />
          {!compact && t('games.logs')}
        </Link>
      )}
      {entry.state !== 'launching' && (
        <Button
          size="sm"
          variant="danger"
          icon="lucide:square"
          disabled={stopDisabled}
          onClick={() => void stop(entry.profileId).catch((error: unknown) => toast.error(error))}
          aria-label={`${t('games.stop')}: ${entry.name}`}
        >
          {t('games.stop')}
        </Button>
      )}
    </div>
  )
}
