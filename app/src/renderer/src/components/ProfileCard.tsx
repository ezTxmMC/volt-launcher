import { type MouseEvent, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '@iconify/react'
import type { Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { LOADER_NAMES } from '@/lib/labels'
import { useToast } from '@/state/toast'
import { ConfirmModal } from './ConfirmModal'
import { ProfileContextMenu } from './profile/ProfileContextMenu'
import { ART_STYLE, ProfileLogo } from './profile/logo/ProfileLogo'
import { Badge } from './ui/Badge'

/** Shows the chosen icon, or the initial on the card art when there is none. */
export function ProfileAvatar({
  name,
  size = 'md',
  iconUrl
}: {
  name: string
  size?: 'md' | 'lg'
  iconUrl?: string | null
}) {
  const box = `grid shrink-0 place-items-center overflow-hidden rounded-xl font-bold text-white/80 ${
    size === 'lg' ? 'size-16 text-2xl' : 'size-12 text-lg'
  }`
  if (iconUrl) {
    return (
      <span className={box} style={ART_STYLE} aria-hidden="true">
        <img src={iconUrl} alt="" className="size-full object-cover" />
      </span>
    )
  }
  return (
    <span className={box} style={ART_STYLE} aria-hidden="true">
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

/** Compact play time: "3 h 20 min", "45 min", "0 min". */
export function formatPlaytime(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`
}

export interface ProfileCardProps {
  profile: Profile
  /** Shows a "running" dot on the card. */
  running?: boolean
  /** When given, the card shows a star button that calls this. */
  onToggleFavourite?: (profile: Profile) => void
  /** Called after the card's context menu changed the profile list (favourite, delete). */
  onChanged?: () => void
}

/**
 * Profile tile of the profiles grid. Hover only changes the border and the background, with fixed
 * accent values that are the same in both themes (the old `--accent-border-hover` token was never
 * defined, so the border fell back to the text colour: white in the dark theme).
 */
export function ProfileCard({ profile, running = false, onToggleFavourite, onChanged }: ProfileCardProps) {
  const { t, language } = useI18n()
  const toast = useToast()
  const favourite = profile.favourite === true
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const openMenu = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    // The Menu key and Shift+F10 send a contextmenu event without a pointer position: anchor at the card.
    if (event.clientX === 0 && event.clientY === 0) {
      const rect = event.currentTarget.getBoundingClientRect()
      setMenuAt({ x: rect.left + 16, y: rect.top + 16 })
    } else {
      setMenuAt({ x: event.clientX, y: event.clientY })
    }
  }

  return (
    <div className="relative h-48" onContextMenu={openMenu}>
      <Link
        to={`/profiles/${profile.id}`}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-[var(--card-solid)] text-left backface-hidden transition-[transform,border-color] duration-[var(--motion-base)] ease-[var(--motion-ease)] hover:translate-y-[var(--motion-lift)] hover:border-[rgba(0,178,255,0.4)] hover:shadow-[inset_0_0_0_9999px_rgba(0,178,255,0.06)]"
      >
        <div className="relative h-[100px] shrink-0 overflow-hidden rounded-t-xl border-b border-black/40" style={ART_STYLE}>
          <ProfileLogo profile={profile} />
          {running && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-[4px] bg-success-soft px-1.5 py-0.5 text-[11px] font-semibold text-success">
              <span className="size-1.5 rounded-full bg-success" />
              {t('profiles.running')}
            </span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-center px-3 py-2.5">
          <h3 className="mb-1.5 truncate text-[15.5px] leading-[1.35] font-semibold" title={profile.name}>
            {profile.name}
          </h3>
          <div className="flex flex-wrap items-center gap-[5px] text-[12px] text-muted">
            <Badge tone="neutral">{profile.minecraftVersion}</Badge>
            <Badge tone="neutral">{LOADER_NAMES[profile.loader] ?? profile.loader}</Badge>
            {profile.source && <Badge tone="accent">{profile.source.name}</Badge>}
          </div>
          <p className="mt-1.5 truncate text-[12px] text-subtle">
            {profile.lastPlayed
              ? t('profiles.lastPlayed', { when: formatRelative(profile.lastPlayed, language) })
              : t('profiles.neverPlayed')}
          </p>
        </div>
      </Link>
      {onToggleFavourite && (
        <button
          type="button"
          onClick={() => onToggleFavourite(profile)}
          aria-pressed={favourite}
          aria-label={favourite ? t('profiles.favourite.remove') : t('profiles.favourite.add')}
          title={favourite ? t('profiles.favourite.remove') : t('profiles.favourite.add')}
          className={`absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-full border backdrop-blur-sm transition-colors ${
            favourite
              ? 'border-[var(--accent-border-strong)] bg-accent-soft-strong text-accent'
              : 'border-white/10 bg-black/40 text-white/70 hover:text-white'
          }`}
        >
          <Icon icon="lucide:star" className="size-4" />
        </button>
      )}
      {menuAt && (
        <ProfileContextMenu
          profile={profile}
          running={running}
          x={menuAt.x}
          y={menuAt.y}
          onClose={() => setMenuAt(null)}
          onChanged={onChanged}
          onDelete={() => setConfirmDelete(true)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          title={t('profile.delete.title')}
          message={t('profile.delete.message', { name: profile.name })}
          confirmLabel={t('profile.delete')}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api.profiles.remove(profile.id)
            toast.success(t('profile.deleted', { name: profile.name }))
            onChanged?.()
          }}
        />
      )}
    </div>
  )
}
