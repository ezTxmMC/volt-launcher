import { useCallback, useState } from 'react'
import type { AutoProfileLoader, AutoProfileMod, ProjectSummary } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync, useDebounced } from '@/lib/hooks'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Feedback'
import { Field, TextInput } from '@/components/ui/Field'

const SEARCH_DELAY_MS = 300
const MIN_QUERY_LENGTH = 2
const RESULT_LIMIT = 10

const NO_RESULTS: ProjectSummary[] = []

/**
 * Small inline search for Modrinth mods of the chosen loader. Results come debounced; a mod that is
 * already in the preset shows a note instead of the add button.
 */
export function ModPicker({
  loader,
  selected,
  onAdd,
  onClose
}: {
  loader: AutoProfileLoader
  selected: readonly AutoProfileMod[]
  onAdd: (mod: AutoProfileMod) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const query = useDebounced(text.trim(), SEARCH_DELAY_MS)
  const searching = query.length >= MIN_QUERY_LENGTH

  const load = useCallback(
    () =>
      searching
        ? api.providers
            .search('modrinth', { q: query, kind: 'mod', loader, offset: 0, limit: RESULT_LIMIT })
            .then((result) => result.items)
        : Promise.resolve(NO_RESULTS),
    [searching, query, loader]
  )
  const results = useAsync(load)
  const items = results.data ?? NO_RESULTS

  return (
    <div className="grid gap-3 rounded-[10px] border border-line bg-surface-input-muted p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Field label={t('autoprofiles.search.label')} hint={t('autoprofiles.search.hint')}>
            <TextInput
              type="search"
              autoFocus
              value={text}
              placeholder={t('autoprofiles.search.placeholder')}
              onChange={(event) => setText(event.target.value)}
              className="w-full"
            />
          </Field>
        </div>
        {/* Sits level with the input, below the caption. */}
        <Button size="sm" variant="ghost" icon="lucide:x" onClick={onClose} aria-label={t('autoprofiles.search.close')} title={t('autoprofiles.search.close')} className="mt-7" />
      </div>

      {results.error && <ErrorNotice message={results.error} onRetry={results.reload} />}

      {searching && results.loading && items.length === 0 && (
        <p className="text-[13px] text-subtle">{t('autoprofiles.search.searching')}</p>
      )}

      {searching && !results.loading && !results.error && items.length === 0 && (
        <p className="text-[13px] text-subtle">{t('autoprofiles.search.empty')}</p>
      )}

      {items.length > 0 && (
        <ul className={`grid max-h-64 gap-1 overflow-y-auto overscroll-contain transition-opacity ${results.loading ? 'opacity-60' : ''}`}>
          {items.map((project) => {
            const added = selected.some((mod) => mod.projectId === project.id)
            return (
              <li key={project.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-white/[0.04]">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{project.name}</p>
                  <p className="truncate text-[12px] text-subtle">
                    {project.author}
                    {project.summary ? ` · ${project.summary}` : ''}
                  </p>
                </div>
                {added ? (
                  <span className="shrink-0 text-[12px] text-subtle">{t('autoprofiles.search.added')}</span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="lucide:plus"
                    aria-label={t('autoprofiles.search.addName', { name: project.name })}
                    onClick={() => onAdd({ provider: 'modrinth', projectId: project.id, name: project.name })}
                  >
                    {t('autoprofiles.search.add')}
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
