import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import type { Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { LOADER_NAMES } from '@/lib/labels'

interface LaunchDockProps {
  profiles: readonly Profile[]
  /** The profile the launch button starts. */
  profile: Profile
  /** Large text of the launch button, e.g. "Launch 1.21.1". */
  title: string
  /** Launch or install in progress: the play side shows a spinner and both sides are disabled. */
  busy: boolean
  /** The play side is disabled (busy, or the game of this profile is running). */
  disabled: boolean
  onLaunch: () => void
  onSelect: (id: string) => void
  /** Shown below the button, e.g. the job row of the launch. */
  footer?: ReactNode
}

/**
 * Tag with the profile's version and loader above a split button: the play side starts the
 * profile, the square side opens a popover to pick another profile.
 */
export function LaunchDock({ profiles, profile, title, busy, disabled, onLaunch, onSelect, footer }: LaunchDockProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const loader = LOADER_NAMES[profile.loader] ?? profile.loader
  const canSwitch = profiles.length > 1 && !busy

  // Close on a click outside the dock or on Escape, as the account menu does.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="flex w-full max-w-[440px] flex-col items-center gap-0">
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-t-md border border-b-0 border-accent-line bg-surface-strong px-3 py-1 text-[12px] font-semibold whitespace-nowrap">
        <Icon icon="lucide:boxes" className="size-3.5 shrink-0 text-accent" />
        <span className="truncate">{`${profile.minecraftVersion} ${loader}`}</span>
      </span>

      <div ref={rootRef} className="relative flex h-[76px] w-full rounded-xl bg-accent text-white shadow-[var(--shadow-accent-lg)]">
        <button
          type="button"
          onClick={onLaunch}
          disabled={disabled}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-l-xl px-5 text-left transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-80 disabled:hover:bg-accent"
        >
          {busy ? (
            <Icon icon="lucide:loader-circle" className="size-8 shrink-0 animate-spin" />
          ) : (
            <Icon icon="lucide:play" className="size-8 shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[20px] leading-6 font-bold">{title}</span>
            <span className="block truncate text-[13px] leading-5 text-white/75">{profile.name}</span>
          </span>
        </button>

        <span aria-hidden="true" className="my-3 w-px bg-white/30" />

        <button
          type="button"
          aria-label={t('home.chooseProfile')}
          title={t('home.chooseProfile')}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={!canSwitch}
          onClick={() => setOpen((value) => !value)}
          className="grid w-[76px] shrink-0 place-items-center rounded-r-xl transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-accent"
        >
          <Icon icon="lucide:arrow-left-right" className="size-5" />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={t('home.profiles')}
            className="absolute right-0 bottom-full z-30 mb-2 grid max-h-[min(340px,55vh)] w-[280px] max-w-[calc(100vw-2rem)] gap-1 overflow-y-auto rounded-xl border border-line-strong bg-surface-strong p-1.5 text-fg shadow-pop"
          >
            {profiles.map((entry) => {
              const selected = entry.id === profile.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setOpen(false)
                    if (!selected) onSelect(entry.id)
                  }}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    selected ? 'bg-accent-soft-strong text-accent' : 'hover:bg-surface-3'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{entry.name}</span>
                    <span className="block truncate text-[12px] text-subtle">
                      {`${entry.minecraftVersion} ${LOADER_NAMES[entry.loader] ?? entry.loader}`}
                    </span>
                  </span>
                  {selected && <Icon icon="lucide:check" className="size-4 shrink-0" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {footer && <div className="mt-2 w-full">{footer}</div>}
    </div>
  )
}
