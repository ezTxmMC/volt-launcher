import { useCallback, useMemo, useState } from 'react'
import type { ProviderInfo, SyncPackEntry, SyncPackKind, ProjectSummary } from '@shared/models'
import { SYNC_PACK_KINDS } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync, useDebounced } from '@/lib/hooks'
import { KIND_LABELS, PROVIDER_NAMES } from '@/lib/labels'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Feedback'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { entryKey } from './options'
import { EntryIcon } from './SyncPackEditor'

const SEARCH_DELAY_MS = 300
const MIN_QUERY_LENGTH = 2
const RESULT_LIMIT = 10
/** The sources a pack entry can come from. */
const SOURCES = ['modrinth', 'curseforge'] as const
type Source = (typeof SOURCES)[number]

const NO_RESULTS: ProjectSummary[] = []

/**
 * Search for pack entries: the kind (mods, resource packs, shaders) and the source choose the endpoint the
 * Discover page uses for that kind. A project already in the pack shows a note instead of the add button.
 */
export function SyncPackPicker({
  selected,
  onAdd,
  onClose
}: {
  selected: readonly SyncPackEntry[]
  onAdd: (entry: SyncPackEntry) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const providers = useAsync(api.providers.list)
  const [kind, setKind] = useState<SyncPackKind>('mod')
  const [source, setSource] = useState<Source>('modrinth')
  const [text, setText] = useState('')
  const query = useDebounced(text.trim(), SEARCH_DELAY_MS)
  const searching = query.length >= MIN_QUERY_LENGTH

  // Only the sources that offer the chosen kind are listed; an unconfigured one stays visible but disabled.
  const sourceInfo = useCallback(
    (id: Source): ProviderInfo | undefined => providers.data?.find((provider) => provider.id === id),
    [providers.data]
  )
  const offers = (id: Source): boolean => sourceInfo(id)?.kinds.includes(kind) ?? id === 'modrinth'
  const activeSource: Source = offers(source) ? source : (SOURCES.find((id) => offers(id)) ?? 'modrinth')

  const load = useCallback(
    () =>
      searching
        ? api.providers
            .search(activeSource, { q: query, kind, offset: 0, limit: RESULT_LIMIT })
            .then((result) => result.items)
        : Promise.resolve(NO_RESULTS),
    [searching, activeSource, query, kind]
  )
  const results = useAsync(load)
  const items = results.data ?? NO_RESULTS
  const keys = useMemo(() => new Set(selected.map((entry) => entryKey(entry))), [selected])

  return (
    <div className="grid gap-3 rounded-[10px] border border-line bg-surface-input-muted p-3">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <Field label={t('syncpacks.picker.kind')}>
            <Select value={kind} onChange={(event) => setKind(event.target.value as SyncPackKind)}>
              {SYNC_PACK_KINDS.map((option) => (
                <option key={option} value={option}>
                  {t(KIND_LABELS[option])}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('syncpacks.picker.source')}>
            <Select value={activeSource} onChange={(event) => setSource(event.target.value as Source)}>
              {SOURCES.map((id) => (
                <option key={id} value={id} disabled={sourceInfo(id)?.configured === false || !offers(id)}>
                  {PROVIDER_NAMES[id]}
                  {sourceInfo(id)?.configured === false ? ` (${t('syncpacks.picker.notConfigured')})` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <Field label={t('syncpacks.picker.search')} hint={t('syncpacks.picker.hint')}>
        <div className="flex items-center gap-2">
          <TextInput
            type="search"
            autoFocus
            value={text}
            placeholder={t('syncpacks.picker.placeholder')}
            onChange={(event) => setText(event.target.value)}
            className="min-w-0 flex-1"
          />
          <Button size="sm" variant="ghost" icon="lucide:x" onClick={onClose} aria-label={t('syncpacks.picker.close')} title={t('syncpacks.picker.close')} />
        </div>
      </Field>

      {results.error && <ErrorNotice message={results.error} onRetry={results.reload} />}

      {searching && results.loading && items.length === 0 && (
        <p className="text-[13px] text-subtle">{t('syncpacks.picker.searching')}</p>
      )}

      {searching && !results.loading && !results.error && items.length === 0 && (
        <p className="text-[13px] text-subtle">{t('syncpacks.picker.empty')}</p>
      )}

      {items.length > 0 && (
        <ul className={`grid max-h-64 gap-1 overflow-y-auto overscroll-contain transition-opacity ${results.loading ? 'opacity-60' : ''}`}>
          {items.map((project) => {
            const entry: SyncPackEntry = {
              provider: activeSource,
              projectId: project.id,
              kind,
              name: project.name,
              iconUrl: project.iconUrl
            }
            const added = keys.has(entryKey(entry))
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
                  <span className="shrink-0 text-[12px] text-subtle">{t('syncpacks.picker.added')}</span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="lucide:plus"
                    aria-label={t('syncpacks.picker.addName', { name: project.name })}
                    onClick={() => onAdd(entry)}
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
