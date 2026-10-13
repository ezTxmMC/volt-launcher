import { useCallback, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import type { ProjectSummary, ProviderInfo, SyncPackEntry, SyncPackKind } from '@shared/models'
import { SYNC_PACK_KINDS } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync, useDebounced } from '@/lib/hooks'
import { KIND_ICONS, KIND_LABELS, PROVIDER_ICONS, PROVIDER_NAMES } from '@/lib/labels'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Feedback'
import { TextInput } from '@/components/ui/Field'
import { entryKey } from './options'
import { EntryIcon } from './PackEntries'

const SEARCH_DELAY_MS = 300
const RESULT_LIMIT = 12
/** The sources a pack entry can come from. */
const SOURCES = ['modrinth', 'curseforge'] as const
type Source = (typeof SOURCES)[number]

const NO_RESULTS: ProjectSummary[] = []

const pillClass = (active: boolean): string =>
  `inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13.5px] font-semibold tracking-[0.07em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
    active
      ? 'border-accent-line bg-accent-soft-strong text-accent'
      : 'border-line bg-white/[0.03] text-muted hover:bg-white/[0.07] hover:text-fg/80'
  }`

/**
 * Search for pack entries with the endpoints of Discover: a kind switch (mods, resource packs, shaders), a source
 * switch (Modrinth, CurseForge) and a search field. Without a query the most downloaded projects are listed.
 * A project already in the pack shows "Im Pack"; one click on "Hinzufügen" adds it (`onAdd` saves).
 */
export function PackPicker({
  selected,
  onAdd,
  disabled = false
}: {
  selected: readonly SyncPackEntry[]
  onAdd: (entry: SyncPackEntry) => Promise<void>
  disabled?: boolean
}) {
  const { t } = useI18n()
  const providers = useAsync(api.providers.list)
  const [kind, setKind] = useState<SyncPackKind>('mod')
  const [source, setSource] = useState<Source>('modrinth')
  const [text, setText] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const query = useDebounced(text.trim(), SEARCH_DELAY_MS)

  // Only the sources that offer the chosen kind are usable; an unconfigured one stays visible but disabled.
  const sourceInfo = useCallback(
    (id: Source): ProviderInfo | undefined => providers.data?.find((provider) => provider.id === id),
    [providers.data]
  )
  const usable = (id: Source): boolean => {
    const info = sourceInfo(id)
    return info ? info.configured && info.kinds.includes(kind) : id === 'modrinth'
  }
  const activeSource: Source = usable(source) ? source : (SOURCES.find((id) => usable(id)) ?? 'modrinth')

  const load = useCallback(
    () =>
      api.providers
        .search(activeSource, { q: query, kind, sort: query === '' ? 'downloads' : undefined, offset: 0, limit: RESULT_LIMIT })
        .then((result) => result.items),
    [activeSource, query, kind]
  )
  const results = useAsync(load)
  const items = results.data ?? NO_RESULTS
  const keys = useMemo(() => new Set(selected.map((entry) => entryKey(entry))), [selected])

  const add = async (entry: SyncPackEntry): Promise<void> => {
    setAdding(entryKey(entry))
    try {
      await onAdd(entry)
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="grid gap-3 rounded-[10px] border border-line bg-surface-input-muted p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label={t('syncpacks.picker.kind')} className="flex flex-wrap gap-2">
          {SYNC_PACK_KINDS.map((option) => (
            <button key={option} type="button" aria-pressed={option === kind} onClick={() => setKind(option)} className={pillClass(option === kind)}>
              <Icon icon={KIND_ICONS[option]} className="size-[12px]" />
              {t(KIND_LABELS[option])}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t('syncpacks.picker.source')} className="flex flex-wrap gap-2">
          {SOURCES.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === activeSource}
              disabled={!usable(id)}
              title={sourceInfo(id)?.configured === false ? t('syncpacks.picker.notConfigured') : undefined}
              onClick={() => setSource(id)}
              className={pillClass(id === activeSource)}
            >
              <Icon icon={PROVIDER_ICONS[id]} className="size-[12px]" />
              {PROVIDER_NAMES[id]}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Icon icon="lucide:search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <TextInput
          type="search"
          value={text}
          aria-label={t('syncpacks.picker.search')}
          placeholder={t('syncpacks.picker.placeholder')}
          onChange={(event) => setText(event.target.value)}
          className="w-full pl-9"
        />
      </div>
      <p className="-mt-1 text-[12px] text-subtle">{query === '' ? t('syncpacks.picker.popular') : t('syncpacks.picker.hint')}</p>

      {results.error && <ErrorNotice message={results.error} onRetry={results.reload} />}

      {results.loading && items.length === 0 && !results.error && (
        <p className="text-[13px] text-subtle" role="status">
          {t('syncpacks.picker.searching')}
        </p>
      )}

      {!results.loading && !results.error && items.length === 0 && (
        <p className="text-[13px] text-subtle">{t('syncpacks.picker.empty')}</p>
      )}

      {items.length > 0 && (
        <ul className={`grid max-h-72 gap-1 overflow-y-auto overscroll-contain transition-opacity ${results.loading ? 'opacity-60' : ''}`}>
          {items.map((project) => {
            const entry: SyncPackEntry = {
              provider: activeSource,
              projectId: project.id,
              kind,
              name: project.name,
              iconUrl: project.iconUrl
            }
            const key = entryKey(entry)
            const added = keys.has(key)
            return (
              <li key={project.id} className="flex min-w-0 items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-white/[0.04]">
                <EntryIcon url={project.iconUrl} kind={kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{project.name}</p>
                  <p className="truncate text-[12px] text-subtle">
                    {project.author}
                    {project.summary ? ` · ${project.summary}` : ''}
                  </p>
                </div>
                {added ? (
                  <Badge tone="success" icon="lucide:check">
                    {t('syncpacks.picker.added')}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="lucide:plus"
                    disabled={disabled || adding !== null}
                    loading={adding === key}
                    aria-label={t('syncpacks.picker.addName', { name: project.name })}
                    onClick={() => void add(entry)}
                  >
                    {t('syncpacks.picker.add')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
