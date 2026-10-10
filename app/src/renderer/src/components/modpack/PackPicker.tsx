import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import { Icon } from '@iconify/react'
import type { ProjectSummary, ProviderId } from '@shared/models'
import { useI18n } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { useAsync, useDebounced } from '@/lib/hooks'
import { PROVIDER_ICONS, PROVIDER_NAMES } from '@/lib/labels'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, Spinner } from '@/components/ui/Feedback'
import { Field, TextInput } from '@/components/ui/Field'
import { ProjectIcon } from '@/components/ui/ProjectIcon'
import { stepOf } from './packLink'

const PROVIDER_ORDER: readonly ProviderId[] = ['modrinth', 'curseforge', 'technic', 'ftb']
const PAGE_SIZE = 20
const SEARCH_DELAY_MS = 300

/** Identity of one search request; an answer is current only while its key matches. */
const keyOf = (provider: ProviderId, term: string, limit: number): string => `${provider}|${term}|${limit}`

interface SearchState {
  key: string
  items: ProjectSummary[]
  hasMore: boolean
  error: string | null
}

/**
 * Step one of the connect dialog: the content source, then a debounced search for modpacks.
 * A click on a pack hands it to the caller.
 */
export function PackPicker({ onPick }: { onPick: (pack: ProjectSummary) => void }) {
  const { t } = useI18n()
  const loadProviders = useCallback(() => api.providers.list(), [])
  const { data: providers } = useAsync(loadProviders)
  const [provider, setProvider] = useState<ProviderId>('modrinth')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const term = useDebounced(query.trim(), SEARCH_DELAY_MS)
  const [search, setSearch] = useState<SearchState | null>(null)
  const key = keyOf(provider, term, limit)

  useEffect(() => {
    const requestKey = keyOf(provider, term, limit)
    let cancelled = false
    api.providers.search(provider, { q: term, kind: 'modpack', offset: 0, limit }).then(
      (result) => {
        if (cancelled) return
        setSearch({ key: requestKey, items: result.items, hasMore: result.hasMore ?? result.items.length >= limit, error: null })
      },
      (error: unknown) => {
        if (!cancelled) setSearch({ key: requestKey, items: [], hasMore: false, error: errorMessage(error) })
      }
    )
    return () => {
      cancelled = true
    }
  }, [provider, term, limit])

  // The previous answer stays on screen, dimmed, until the answer for the current request arrives.
  const current = search?.key === key ? search : null
  const shown = search?.items ?? []
  const stale = current === null
  const error = current?.error ?? null

  const chooseProvider = (next: ProviderId): void => {
    setProvider(next)
    setLimit(PAGE_SIZE)
  }

  const onProviderKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = stepOf(event.key)
    if (step === 0) return
    event.preventDefault()
    const index = PROVIDER_ORDER.indexOf(provider)
    const nextIndex = (index + step + PROVIDER_ORDER.length) % PROVIDER_ORDER.length
    const next = PROVIDER_ORDER[nextIndex]
    if (!next) return
    chooseProvider(next)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus()
  }

  return (
    <div className="grid gap-4">
      <div
        role="radiogroup"
        aria-label={t('profile.modpack.connect.providerGroup')}
        onKeyDown={onProviderKey}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {PROVIDER_ORDER.map((id) => {
          const info = providers?.find((entry) => entry.id === id)
          const configured = info?.configured ?? true
          const checked = id === provider
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => chooseProvider(id)}
              className={`flex min-w-0 flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors ${
                checked
                  ? 'border-[var(--accent-border-strong)] bg-accent-soft-strong text-accent'
                  : 'border-line bg-surface-input text-fg/80 hover:border-accent-line'
              }`}
            >
              <span className="flex max-w-full items-center gap-2 font-semibold">
                <Icon icon={PROVIDER_ICONS[id]} className="size-4 shrink-0" />
                <span className="truncate">{PROVIDER_NAMES[id]}</span>
              </span>
              {!configured && <span className="text-[12px] leading-4 text-warning">{t('profile.modpack.connect.needsBridge')}</span>}
            </button>
          )
        })}
      </div>

      <Field label={t('profile.modpack.connect.search')}>
        <TextInput
          type="search"
          value={query}
          placeholder={t('profile.modpack.connect.searchPlaceholder')}
          onChange={(event) => {
            setQuery(event.target.value)
            setLimit(PAGE_SIZE)
          }}
        />
      </Field>

      {error && <ErrorNotice message={error} />}
      {!error && stale && shown.length === 0 && (
        <p className="flex items-center gap-2 text-subtle">
          <Spinner className="size-4" />
          {t('profile.modpack.connect.searching')}
        </p>
      )}
      {!error && !stale && shown.length === 0 && <p className="text-muted">{t('profile.modpack.connect.noResults')}</p>}

      {shown.length > 0 && (
        <div className={`grid gap-3 transition-opacity ${stale ? 'opacity-60' : ''}`} aria-busy={stale}>
          <ul className="grid gap-2">
            {shown.map((pack) => (
              <li key={`${pack.provider}:${pack.id}`} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onPick(pack)}
                  className="flex w-full min-w-0 items-start gap-3 rounded-xl border border-line bg-surface-input p-3 text-left transition-colors hover:border-accent-line hover:bg-surface-3"
                >
                  <ProjectIcon url={pack.iconUrl} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate font-semibold">{pack.name}</span>
                    {pack.author && <span className="truncate text-[12px] text-subtle">{t('project.by', { author: pack.author })}</span>}
                    {pack.summary && <span className="line-clamp-2 text-[13px] leading-5 text-muted">{pack.summary}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {current?.hasMore && (
            <Button className="justify-self-center" disabled={stale} onClick={() => setLimit((value) => value + PAGE_SIZE)}>
              {t('profile.modpack.connect.loadMore')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
