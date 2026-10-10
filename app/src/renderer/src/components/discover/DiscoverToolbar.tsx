import { Icon } from '@iconify/react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { DebouncedInput } from './filters/DebouncedInput'
import { DiscoverPagination } from './DiscoverPagination'
import { PER_PAGE_OPTIONS } from './useDiscoverPrefs'
import type { DiscoverView } from './useDiscoverPrefs'

interface DiscoverToolbarProps {
  query: string
  onQuery: (value: string) => void
  searchPlaceholder: string
  searchEnabled: boolean
  sortOptions: ReadonlyArray<{ value: string; label: string }>
  sort: string
  onSort: (value: string) => void
  perPage: number
  onPerPage: (value: number) => void
  view: DiscoverView
  onView: (view: DiscoverView) => void
  page: number
  pages: number | null
  hasMore: boolean
  onPage: (page: number) => void
  onOpenFilters: () => void
}

/**
 * Top of the results: the search field across the full width, then one row with the sort select,
 * the results-per-page select, the page navigator and the list/grid toggle. Below 1100 px the row
 * also holds the Filters button, which opens the sidebar as a drawer.
 */
export function DiscoverToolbar({
  query,
  onQuery,
  searchPlaceholder,
  searchEnabled,
  sortOptions,
  sort,
  onSort,
  perPage,
  onPerPage,
  view,
  onView,
  page,
  pages,
  hasMore,
  onPage,
  onOpenFilters
}: DiscoverToolbarProps) {
  const { t } = useI18n()
  const perPageOptions = PER_PAGE_OPTIONS.map((count) => ({ value: String(count), label: String(count) }))

  return (
    <div className="grid gap-2.5">
      {searchEnabled && (
        <DebouncedInput
          ariaLabel={t('discover.search')}
          placeholder={searchPlaceholder}
          value={query}
          onCommit={onQuery}
          icon="lucide:search"
          className="w-full"
        />
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="secondary" icon="lucide:sliders-horizontal" onClick={onOpenFilters} className="min-[1100px]:hidden">
          {t('discover.filters')}
        </Button>
        {sortOptions.length > 0 && (
          <div className="flex items-center gap-2 text-[13.5px] text-muted">
            <span className="whitespace-nowrap">{t('discover.sort')}:</span>
            <Select<string>
              ariaLabel={t('discover.sort')}
              size="sm"
              value={sort}
              onChange={onSort}
              options={sortOptions}
              className="w-48"
            />
          </div>
        )}
        <div className="flex items-center gap-2 text-[13.5px] text-muted">
          <span className="whitespace-nowrap">{t('discover.perPage')}:</span>
          <Select<string>
            ariaLabel={t('discover.perPage.label')}
            size="sm"
            value={String(perPage)}
            onChange={(value) => onPerPage(Number(value))}
            options={perPageOptions}
            className="w-20"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DiscoverPagination page={page} pages={pages} hasMore={hasMore} onPage={onPage} />
          <ViewToggle view={view} onView={onView} />
        </div>
      </div>
    </div>
  )
}

function ViewToggle({ view, onView }: { view: DiscoverView; onView: (view: DiscoverView) => void }) {
  const { t } = useI18n()
  const options: Array<{ id: DiscoverView; icon: string; label: string }> = [
    { id: 'list', icon: 'lucide:layout-list', label: t('discover.view.list') },
    { id: 'grid', icon: 'lucide:layout-grid', label: t('discover.view.grid') }
  ]
  return (
    <div role="group" aria-label={t('discover.view.label')} className="inline-flex overflow-hidden rounded-lg border border-line">
      {options.map((option) => {
        const active = option.id === view
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => onView(option.id)}
            className={`grid h-8 w-9 place-items-center transition-colors ${
              active ? 'bg-accent-soft-strong text-accent' : 'bg-surface-input text-muted hover:text-fg'
            }`}
          >
            <Icon icon={option.icon} aria-hidden="true" className="size-4" />
          </button>
        )
      })}
    </div>
  )
}
