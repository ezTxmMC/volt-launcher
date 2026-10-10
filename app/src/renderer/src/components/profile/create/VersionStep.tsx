import { useCallback, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import type { GameVersion, Loader } from '@shared/models'
import { useI18n, type MessageKey } from '@/i18n'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useAsync, useDebounced } from '@/lib/hooks'
import { LOADER_NAMES } from '@/lib/labels'
import { Badge } from '@/components/ui/Badge'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { TextInput } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { LOADER_META } from './loaders'
import { categoryArt, categorySwatch } from './versionArt'
import {
  VERSION_FILTERS,
  categoryOf,
  groupLines,
  includeSnapshotsFor,
  lineKeyOf,
  matchesFilter,
  matchesText,
  readVersionView,
  writeVersionView,
  type VersionCategory,
  type VersionFilter,
  type VersionLine,
  type VersionView
} from './versions'

/** Chips shown on a tile; the rest stays reachable through the list view. */
const MAX_CHIPS = 4
const SEARCH_DELAY_MS = 200

const FILTER_LABELS: Record<VersionFilter, MessageKey> = {
  releases: 'createProfile.version.filter.releases',
  snapshots: 'createProfile.version.filter.snapshots',
  all: 'createProfile.version.filter.all'
}

function typeLabel(type: string): MessageKey {
  if (type === 'release') return 'createProfile.version.type.release'
  if (type === 'snapshot') return 'createProfile.version.type.snapshot'
  return 'createProfile.version.type.other'
}

interface VersionStepProps {
  loader: Loader
  selected: string
  onSelect: (id: string) => void
  search: string
  onSearch: (search: string) => void
  filter: VersionFilter
  onFilter: (filter: VersionFilter) => void
}

/** Step 2: Minecraft versions as tiles (per minor line, with patch chips) or as a list. */
export function VersionStep({ loader, selected, onSelect, search, onSearch, filter, onFilter }: VersionStepProps) {
  const { t, language } = useI18n()
  const [view, setView] = useState<VersionView>(readVersionView)
  const loadVersions = useCallback(
    () => api.versions.minecraft({ includeSnapshots: includeSnapshotsFor(filter) }),
    [filter]
  )
  const { data, error, loading, reload } = useAsync(loadVersions)
  const query = useDebounced(search.trim().toLowerCase(), SEARCH_DELAY_MS)

  // Lines are built from the whole filtered list, so a tile always selects the same version.
  const versions = useMemo(() => (data ?? []).filter((version) => matchesFilter(version, filter)), [data, filter])
  const lines = useMemo(() => groupLines(versions), [versions])
  const visibleLines = useMemo(
    () => lines.filter((line) => line.members.some((member) => matchesText(member, query))),
    [lines, query]
  )
  const visibleVersions = useMemo(() => versions.filter((version) => matchesText(version, query)), [versions, query])

  const meta = LOADER_META[loader]
  const hasData = data !== undefined

  const changeView = (next: VersionView): void => {
    setView(next)
    writeVersionView(next)
  }

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[11rem] flex-1">
          <Icon
            icon="lucide:search"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
          />
          <TextInput
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={t('createProfile.version.search')}
            aria-label={t('createProfile.version.searchLabel')}
            className="w-full"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
        <div
          role="group"
          aria-label={t('createProfile.version.view')}
          className="flex shrink-0 gap-0.5 rounded-lg border border-line bg-surface-input p-0.5"
        >
          <ViewButton
            active={view === 'grid'}
            icon="lucide:layout-grid"
            label={t('createProfile.version.view.grid')}
            onClick={() => changeView('grid')}
          />
          <ViewButton
            active={view === 'list'}
            icon="lucide:list"
            label={t('createProfile.version.view.list')}
            onClick={() => changeView('list')}
          />
        </div>
        <Select
          ariaLabel={t('createProfile.version.filter')}
          value={filter}
          onChange={onFilter}
          options={VERSION_FILTERS.map((value) => ({ value, label: t(FILTER_LABELS[value]) }))}
          className="w-[10.5rem] shrink-0"
        />
      </div>

      <div className="flex items-center justify-between gap-3 text-[12.5px] text-subtle">
        <span className="min-w-0 truncate">
          {selected !== ''
            ? t('createProfile.version.selected', { version: selected })
            : t('createProfile.version.nothingSelected')}
        </span>
        {hasData && <span className="shrink-0 tabular-nums">{t('createProfile.version.count', { count: visibleVersions.length })}</span>}
      </div>

      {!meta.hasVersionList ? (
        <p className="rounded-lg border border-line bg-surface-2 px-4 py-8 text-center text-[14px] text-subtle">
          {t('createProfile.version.noList', { loader: LOADER_NAMES[loader] })}
        </p>
      ) : !hasData ? (
        error ? (
          <ErrorNotice message={error} onRetry={reload} />
        ) : (
          <LoadingBlock label={t('createProfile.version.loading')} />
        )
      ) : (
        <div className={`grid min-w-0 gap-3 transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
          {error && <ErrorNotice message={error} onRetry={reload} />}
          <div className="max-h-[min(22rem,46vh)] min-h-0 overflow-y-auto overscroll-contain pr-1">
            {visibleVersions.length === 0 ? (
              <p className="py-10 text-center text-[14px] text-subtle">
                {query !== ''
                  ? t('createProfile.version.empty', { query: search.trim() })
                  : t('createProfile.version.none')}
              </p>
            ) : view === 'grid' ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2.5">
                {visibleLines.map((line) => (
                  <li key={line.key}>
                    <VersionTile line={line} selected={selected} query={query} onSelect={onSelect} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="grid gap-1">
                {visibleVersions.map((version) => (
                  <li key={version.id}>
                    <VersionRow
                      version={version}
                      active={version.id === selected}
                      onSelect={onSelect}
                      category={categoryOf(lineKeyOf(version.id), version.type)}
                      dateText={formatDate(version.releaseTime, language)}
                      typeText={t(typeLabel(version.type))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ViewButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-md transition-colors duration-200 ${
        active ? 'bg-accent-soft-strong text-accent' : 'text-subtle hover:text-fg'
      }`}
    >
      <Icon icon={icon} className="size-4" />
    </button>
  )
}

/**
 * One minor line: the big number on its category art, chips for its patch versions beneath.
 * The tile is a button behind the chips, so the chips can be buttons too (no nested buttons).
 */
function VersionTile({
  line,
  selected,
  query,
  onSelect
}: {
  line: VersionLine
  selected: string
  query: string
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  const patches = line.patches.filter((patch) => matchesText(patch, query))
  const shown = patches.slice(0, MAX_CHIPS)
  const more = patches.length - shown.length
  const holds = line.members.some((member) => member.id === selected)
  const snapshot = line.category === 'snapshot'

  return (
    <div
      className={`relative flex min-h-[7.5rem] flex-col overflow-hidden rounded-[10px] border p-3 transition-[border-color,box-shadow] duration-200 ${
        holds ? 'border-accent ring-2 ring-accent' : 'border-white/10 hover:border-white/35'
      }`}
      style={{ backgroundImage: categoryArt(line.category), backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <button
        type="button"
        aria-pressed={holds}
        aria-label={line.key}
        onClick={() => onSelect(line.primary.id)}
        className="absolute inset-0 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-white"
      />
      {snapshot && (
        <span className="pointer-events-none absolute top-2 left-2 rounded-[5px] bg-[#ffb020] px-1.5 py-0.5 text-[10.5px] leading-4 font-extrabold tracking-wide whitespace-nowrap text-neutral-900 uppercase shadow-sm">
          {t('createProfile.version.type.snapshot')}
        </span>
      )}
      <span
        aria-hidden="true"
        className={`pointer-events-none flex flex-1 items-center justify-center font-black tracking-tight text-white drop-shadow-[0_2px_8px_rgb(0_0_0/0.45)] ${
          line.key.length > 5 ? 'text-[1.15rem]' : 'text-[1.9rem]'
        }`}
      >
        {line.key}
      </span>
      {shown.length > 0 && (
        <span
          role="group"
          aria-label={t('createProfile.version.patches', { line: line.key })}
          className="relative z-10 mt-2 flex flex-wrap gap-1"
        >
          {shown.map((patch) => {
            const on = patch.id === selected
            return (
              <button
                key={patch.id}
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(patch.id)}
                className={`rounded-[5px] border px-1.5 py-0.5 text-[11.5px] leading-4 font-semibold tabular-nums whitespace-nowrap transition-colors ${
                  on ? 'border-white bg-white text-neutral-900' : 'border-white/25 bg-black/40 text-white hover:bg-black/60'
                }`}
              >
                {patch.id}
              </button>
            )
          })}
          {more > 0 && (
            <span className="rounded-[5px] bg-black/40 px-1.5 py-0.5 text-[11.5px] leading-4 font-semibold whitespace-nowrap text-white/85 tabular-nums">
              {t('createProfile.version.more', { count: more })}
            </span>
          )}
        </span>
      )}
    </div>
  )
}

function VersionRow({
  version,
  active,
  onSelect,
  category,
  dateText,
  typeText
}: {
  version: GameVersion
  active: boolean
  onSelect: (id: string) => void
  category: VersionCategory
  dateText: string
  typeText: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(version.id)}
      className={`flex w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-200 ${
        active ? 'border-[var(--accent-border-strong)] bg-accent-soft-strong' : 'border-line bg-surface-2 hover:bg-surface-3'
      }`}
    >
      <span
        aria-hidden="true"
        className="size-4 shrink-0 rounded-[4px] ring-1 ring-white/15"
        style={{ background: categorySwatch(category) }}
      />
      <span className="min-w-0 flex-1 truncate font-semibold tabular-nums">{version.id}</span>
      <Badge tone={version.type === 'release' ? 'accent' : 'neutral'}>{typeText}</Badge>
      <span className="shrink-0 text-[12.5px] text-subtle tabular-nums">{dateText}</span>
      {active && <Icon icon="lucide:check" className="size-4 shrink-0 text-accent" />}
    </button>
  )
}
