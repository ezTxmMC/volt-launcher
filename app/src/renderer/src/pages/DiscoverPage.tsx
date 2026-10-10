import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { useSearchParams } from 'react-router'
import { CONTENT_KINDS } from '@shared/models'
import type { ContentKind, ProviderId, ProviderInfo, SortOption } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { KIND_ICONS, KIND_LABELS, PROVIDER_COLORS, PROVIDER_ICONS, PROVIDER_NAMES } from '@/lib/labels'
import { EmptyState, ErrorNotice } from '@/components/ui/Feedback'
import { Page } from '@/components/ui/Page'
import { DiscoverToolbar } from '@/components/discover/DiscoverToolbar'
import { ProjectResults } from '@/components/discover/ProjectResults'
import { OfflineState, ResultSkeleton, SidebarSkeleton } from '@/components/discover/DiscoverStates'
import { DiscoverSidebar } from '@/components/discover/filters/DiscoverSidebar'
import type { FilterChanges, FilterValues } from '@/components/discover/filters/DiscoverSidebar'
import { DEFAULT_SORT, isOfflineMessage, parseList, sortLabel, usesLoader } from '@/components/discover/filters/model'
import { useOnline } from '@/components/discover/useOnline'
import { parseView, useStoredPerPage, useStoredView } from '@/components/discover/useDiscoverPrefs'
import type { DiscoverView } from '@/components/discover/useDiscoverPrefs'
import { useProviderFilters } from '@/components/discover/useProviderFilters'
import { useProviderSearch } from '@/components/discover/useProviderSearch'
import type { SearchRequest } from '@/components/discover/useProviderSearch'

const NO_SORTS: SortOption[] = []

/**
 * Discover: a filter sidebar and the results of one provider and content kind. The state lives in
 * the URL (provider, kind, q, sort, version, loader, categories, environment, openSource, page, view),
 * so back navigation restores it. Controls a provider does not honour are not rendered.
 */
export function DiscoverPage() {
  const { language, t } = useI18n()
  const [params, setParams] = useSearchParams()
  const online = useOnline()
  const [storedView, setStoredView] = useStoredView()
  const [perPage, setStoredPerPage] = useStoredPerPage()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { data: providers, error: providersError, reload: reloadProviders } = useAsync(
    useCallback(() => api.providers.list(), [])
  )

  const provider: ProviderInfo | undefined =
    providers?.find((candidate) => candidate.id === params.get('provider')) ??
    providers?.find((candidate) => candidate.configured) ??
    providers?.[0]
  const configured = provider?.configured === true
  const kind: ContentKind | undefined =
    provider?.kinds.find((candidate) => candidate === params.get('kind')) ?? provider?.kinds[0]

  const {
    filters,
    error: filtersError,
    reload: reloadFilters
  } = useProviderFilters(configured ? provider?.id : undefined, kind, provider?.sorts ?? NO_SORTS)
  const supports = filters?.supports

  // Values the provider does not honour are read as empty, so no request carries them.
  const sortParam = params.get('sort') ?? ''
  const values: FilterValues = {
    q: params.get('q') ?? '',
    sort: supports?.sort && filters?.sorts.some((option) => option.id === sortParam) ? sortParam : '',
    gameVersion: supports?.gameVersion ? params.get('version') ?? '' : '',
    // Loaders narrow mods and modpacks only; a loader left in the URL is not sent for packs or shaders.
    loader: supports?.loader && kind && usesLoader(kind) ? params.get('loader') ?? '' : '',
    categories: supports?.categories ? parseList(params.get('categories')) : [],
    environment: supports?.environment && kind === 'mod' ? parseList(params.get('environment')) : [],
    openSource: supports?.openSource === true && params.get('openSource') === 'true'
  }
  const hasActive = Boolean(
    values.sort ||
      values.gameVersion ||
      values.loader ||
      values.categories.length > 0 ||
      values.environment.length > 0 ||
      values.openSource
  )
  const sortDefault = filters?.sorts.some((option) => option.id === DEFAULT_SORT)
    ? DEFAULT_SORT
    : filters?.sorts[0]?.id ?? ''

  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)
  const view: DiscoverView = parseView(params.get('view')) ?? storedView

  const request: SearchRequest | null =
    provider && configured && kind && filters
      ? {
          provider: provider.id,
          kind,
          q: supports?.search ? values.q.trim() : '',
          gameVersion: values.gameVersion || undefined,
          loader: values.loader || undefined,
          categories: values.categories,
          sort: values.sort || undefined,
          environment: values.environment.join(',') || undefined,
          openSource: values.openSource,
          page,
          limit: perPage
        }
      : null
  const search = useProviderSearch(request)
  // Pages come from the total; without a total only previous and next are offered.
  const pages = search.total !== null ? Math.max(1, Math.ceil(search.total / perPage)) : null
  const shownPage = pages !== null ? Math.min(page, pages) : page

  // A page past the last one (for example after a shorter result) moves to the last page.
  useEffect(() => {
    if (pages === null || search.loading || search.total === null || search.total === 0 || page <= pages) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('page', String(pages))
        return next
      },
      { replace: true }
    )
  }, [page, pages, search.loading, search.total, setParams])

  // Escape closes the filter drawer (narrow screens).
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const update = useCallback(
    (changes: FilterChanges, resetPage: boolean) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          // Any change of the search, a filter or the page size starts again at the first page.
          if (resetPage) next.delete('page')
          return next
        },
        { replace: true }
      )
    },
    [setParams]
  )

  const changeFilter = (changes: FilterChanges): void => update(changes, true)
  const changePage = (target: number): void => update({ page: target > 1 ? String(target) : undefined }, false)
  const changeView = (next: DiscoverView): void => {
    setStoredView(next)
    update({ view: next }, false)
  }
  const changePerPage = (count: number): void => {
    setStoredPerPage(count)
    update({}, true)
  }

  // Switching provider keeps the search text and the kind (when the new provider has it); the rest is provider-specific.
  const selectProvider = (id: ProviderId): void => {
    update(
      {
        provider: id,
        sort: undefined,
        version: undefined,
        loader: undefined,
        categories: undefined,
        environment: undefined,
        openSource: undefined
      },
      true
    )
  }
  // Categories and the environment are named per kind, so they do not carry over to another kind.
  const selectKind = (candidate: ContentKind): void => update({ kind: candidate, categories: undefined, environment: undefined }, true)
  const resetFilters = (): void =>
    update(
      {
        sort: undefined,
        version: undefined,
        loader: undefined,
        categories: undefined,
        environment: undefined,
        openSource: undefined
      },
      true
    )

  const offlineProviders = providersError !== null && (!online || isOfflineMessage(providersError))
  const offlineFilters = filtersError !== null && (!online || isOfflineMessage(filtersError))
  const offlineSearch = search.error !== null && (!online || isOfflineMessage(search.error))
  const sortOptions = filters && supports?.sort ? filters.sorts.map((option) => ({ value: option.id, label: sortLabel(option, t) })) : []

  let results: ReactNode
  if (!request) {
    results = <ResultSkeleton view={view} />
  } else if (search.error) {
    results = offlineSearch ? (
      <OfflineState onRetry={search.reload} />
    ) : (
      <ErrorNotice message={search.error} onRetry={search.reload} />
    )
  } else if (search.items.length > 0) {
    const count = search.total ?? search.items.length
    results = (
      <>
        <p className="text-[12px] tracking-[0.1em] text-subtle uppercase" aria-live="polite">
          {t('discover.results', { count: new Intl.NumberFormat(language).format(count) })}
        </p>
        <ProjectResults items={search.items} view={view} stale={search.stale} />
      </>
    )
  } else if (search.loading) {
    results = <ResultSkeleton view={view} />
  } else {
    results = <EmptyState icon="lucide:search-x" title={t('discover.empty.title')} description={t('discover.empty.description')} />
  }

  return (
    <Page>
      {providersError &&
        (offlineProviders ? (
          <OfflineState onRetry={reloadProviders} />
        ) : (
          <ErrorNotice message={providersError} onRetry={reloadProviders} />
        ))}

      {providers && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          {provider && (
            <div role="group" aria-label={t('discover.kind')} className="flex flex-wrap gap-2">
              {CONTENT_KINDS.filter((candidate) => provider.kinds.includes(candidate)).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={candidate === kind}
                  onClick={() => selectKind(candidate)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[14px] font-semibold tracking-[0.07em] transition-all duration-200 ${
                    candidate === kind
                      ? 'border-accent-line bg-accent-soft-strong text-accent'
                      : 'border-line bg-white/[0.03] text-muted hover:bg-white/[0.07] hover:text-fg/80'
                  }`}
                >
                  <Icon icon={KIND_ICONS[candidate]} className="size-[11px]" />
                  {t(KIND_LABELS[candidate])}
                </button>
              ))}
            </div>
          )}
          <div role="tablist" aria-label={t('discover.providers')} className="flex flex-wrap gap-2">
            {providers.map((candidate) => {
              const active = candidate.id === provider?.id
              const color = PROVIDER_COLORS[candidate.id]
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectProvider(candidate.id)}
                  title={candidate.configured ? undefined : candidate.message || t('discover.notConfigured')}
                  style={active && color ? { color, background: `${color}18`, borderColor: `${color}30` } : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[14px] font-semibold tracking-[0.07em] transition-all duration-200 ${
                    active ? 'border-transparent' : 'border-line bg-white/[0.03] text-muted hover:bg-white/[0.07] hover:text-fg/80'
                  }`}
                >
                  <Icon icon={PROVIDER_ICONS[candidate.id]} className="size-[11px]" />
                  {PROVIDER_NAMES[candidate.id] ?? candidate.name}
                  {!candidate.configured && (
                    <span className="size-1.5 rounded-full bg-fg/25" aria-label={t('discover.notConfigured')} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {provider && !configured && (
        <EmptyState
          icon="lucide:plug-zap"
          title={t('discover.notConfigured.title', { provider: PROVIDER_NAMES[provider.id] ?? provider.name })}
          description={provider.message || t('discover.notConfigured.description')}
        />
      )}

      {!providers && !providersError && <ResultSkeleton view={view} />}
      {providers && providers.length === 0 && (
        <EmptyState icon="lucide:search-x" title={t('discover.empty.title')} description={t('discover.empty.description')} />
      )}

      {configured && kind && filtersError &&
        (offlineFilters ? (
          <OfflineState onRetry={reloadFilters} />
        ) : (
          <ErrorNotice message={filtersError} onRetry={reloadFilters} />
        ))}

      {configured && kind && !filtersError && (
        <div className="grid items-start gap-4 min-[1100px]:grid-cols-[260px_minmax(0,1fr)]">
          {filters && supports ? (
            <DiscoverSidebar
              kind={kind}
              filters={filters}
              values={values}
              hasActive={hasActive}
              onChange={changeFilter}
              onReset={resetFilters}
              drawerOpen={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            />
          ) : (
            <SidebarSkeleton />
          )}
          <div className="flex min-w-0 flex-col gap-3">
            {filters ? (
              <DiscoverToolbar
                query={values.q}
                onQuery={(value) => changeFilter({ q: value || undefined })}
                searchPlaceholder={t('discover.searchPlaceholder', { kind: t(KIND_LABELS[kind]) })}
                searchEnabled={supports?.search === true}
                sortOptions={sortOptions}
                sort={values.sort || sortDefault}
                onSort={(value) => changeFilter({ sort: value === sortDefault ? undefined : value })}
                perPage={perPage}
                onPerPage={changePerPage}
                view={view}
                onView={changeView}
                page={shownPage}
                pages={pages}
                hasMore={search.hasMore}
                onPage={changePage}
                onOpenFilters={() => setDrawerOpen(true)}
              />
            ) : (
              <div aria-hidden="true" className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
            )}
            {results}
          </div>
        </div>
      )}

      {drawerOpen && (
        <button
          type="button"
          aria-label={t('discover.filters.close')}
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 min-[1100px]:hidden"
        />
      )}
    </Page>
  )
}
