import type { KeyboardEvent } from 'react'
import { Icon } from '@iconify/react'
import type { ProjectVersion } from '@shared/models'
import { useI18n } from '@/i18n'
import { formatDate } from '@/lib/format'
import { ErrorNotice, Spinner } from '@/components/ui/Feedback'
import { stepOf } from './packLink'

const MAX_GAME_VERSIONS = 3

/**
 * Step two of the connect dialog: the releases of the chosen pack as a radio group, newest first.
 * The caller sorts the list and keeps the selection; this view only shows it.
 */
export function VersionPicker({
  versions,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect
}: {
  versions: readonly ProjectVersion[]
  loading: boolean
  error: string | null
  onRetry: () => void
  selectedId: string
  onSelect: (id: string) => void
}) {
  const { t, language } = useI18n()

  if (error) return <ErrorNotice message={error} onRetry={onRetry} />
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-subtle">
        <Spinner className="size-4" />
        {t('common.loading')}
      </p>
    )
  }
  if (versions.length === 0) return <p className="text-muted">{t('profile.modpack.connect.versionsEmpty')}</p>

  const gameVersionsOf = (version: ProjectVersion): string => {
    const list = version.gameVersions
    if (list.length === 0) return ''
    const shown = list.slice(0, MAX_GAME_VERSIONS).join(', ')
    const more = list.length > MAX_GAME_VERSIONS ? ` +${list.length - MAX_GAME_VERSIONS}` : ''
    return t('profile.modpack.connect.gameVersions', { versions: `${shown}${more}` })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = stepOf(event.key)
    if (step === 0) return
    event.preventDefault()
    const index = Math.max(0, versions.findIndex((version) => version.id === selectedId))
    const nextIndex = (index + step + versions.length) % versions.length
    const next = versions[nextIndex]
    if (!next) return
    onSelect(next.id)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={t('profile.modpack.connect.versionsGroup')} onKeyDown={onKeyDown} className="grid gap-1.5">
      {versions.map((version) => {
        const checked = version.id === selectedId
        return (
          <button
            key={version.id}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onSelect(version.id)}
            className={`flex min-w-0 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
              checked
                ? 'border-[var(--accent-border-strong)] bg-accent-soft-strong text-fg'
                : 'border-line bg-surface-input text-fg/80 hover:border-accent-line'
            }`}
          >
            <Icon
              icon={checked ? 'lucide:circle-dot' : 'lucide:circle'}
              className={`size-4 shrink-0 ${checked ? 'text-accent' : 'text-subtle'}`}
            />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate font-medium">{version.name || version.versionNumber}</span>
              {gameVersionsOf(version) && <span className="truncate text-[12px] text-subtle">{gameVersionsOf(version)}</span>}
            </span>
            <time dateTime={version.datePublished} className="shrink-0 text-[12px] text-subtle tabular-nums">
              {formatDate(version.datePublished, language)}
            </time>
          </button>
        )
      })}
    </div>
  )
}
