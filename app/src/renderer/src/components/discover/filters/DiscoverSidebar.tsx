import type { ContentKind } from '@shared/models'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { FilterSection } from './FilterSection'
import { GameVersionFilter } from './GameVersionFilter'
import { CategoryFilter, EnvironmentFilter, LicenseFilter, LoaderFilter } from './SectionFilters'
import { usesLoader } from './model'
import type { ResolvedFilters } from './model'

/** Filter values as the URL holds them (the search text and the sort are read by the page). */
export interface FilterValues {
  q: string
  /** The explicitly chosen sort; empty means the provider's default. */
  sort: string
  gameVersion: string
  loader: string
  categories: string[]
  /** Subset of ['client', 'server']; Modrinth mods only. */
  environment: string[]
  openSource: boolean
}

/** URL keys to change: a missing value (undefined) removes the key. */
export type FilterChanges = Record<string, string | undefined>

interface DiscoverSidebarProps {
  kind: ContentKind
  filters: ResolvedFilters
  values: FilterValues
  hasActive: boolean
  onChange: (changes: FilterChanges) => void
  onReset: () => void
  /** Narrow screens only: the sidebar is a drawer, and this closes it. */
  drawerOpen: boolean
  onClose: () => void
}

/**
 * Filter sidebar: collapsible sections, each shown only when the provider supports it for this kind.
 * Beside 1100 px it is a sticky column; below, it is a drawer that the toolbar's Filters button opens.
 */
export function DiscoverSidebar({ kind, filters, values, hasActive, onChange, onReset, drawerOpen, onClose }: DiscoverSidebarProps) {
  const { t } = useI18n()
  const { supports } = filters
  const showVersion = supports.gameVersion
  const showLoader = supports.loader && usesLoader(kind) && filters.loaders.length > 0
  const showCategory = supports.categories && filters.categories.length > 0
  const showEnvironment = supports.environment === true && kind === 'mod'
  const showLicense = supports.openSource === true

  return (
    <aside
      aria-label={t('discover.filters')}
      className={`flex flex-col gap-2 self-start ${
        drawerOpen
          ? 'max-[1099px]:fixed max-[1099px]:inset-y-0 max-[1099px]:left-0 max-[1099px]:z-40 max-[1099px]:w-[320px] max-[1099px]:max-w-[88vw] max-[1099px]:overflow-y-auto max-[1099px]:bg-bg max-[1099px]:p-3 max-[1099px]:shadow-pop'
          : 'max-[1099px]:hidden'
      } min-[1100px]:sticky min-[1100px]:top-4 min-[1100px]:max-h-[calc(100vh-2rem)] min-[1100px]:overflow-y-auto min-[1100px]:pr-0.5`}
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h2 className="text-[13px] font-bold tracking-[0.12em] text-muted uppercase">{t('discover.filters')}</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon="lucide:rotate-ccw" disabled={!hasActive} onClick={onReset}>
            {t('discover.clearFilters')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="lucide:x"
            aria-label={t('discover.filters.close')}
            title={t('discover.filters.close')}
            onClick={onClose}
            className="min-[1100px]:hidden"
          />
        </div>
      </div>

      {showVersion && (
        <FilterSection title={t('discover.section.gameVersion')}>
          <GameVersionFilter
            versions={filters.gameVersions}
            value={values.gameVersion}
            onChange={(version) => onChange({ version: version || undefined })}
          />
        </FilterSection>
      )}

      {showLoader && (
        <FilterSection title={t('discover.section.loader')}>
          <LoaderFilter
            loaders={filters.loaders}
            value={values.loader}
            onChange={(loader) => onChange({ loader: loader || undefined })}
          />
        </FilterSection>
      )}

      {showCategory && (
        <FilterSection title={t('discover.section.category')}>
          <CategoryFilter
            categories={filters.categories}
            selected={values.categories}
            onChange={(selected) => onChange({ categories: selected.join(',') || undefined })}
          />
        </FilterSection>
      )}

      {showEnvironment && (
        <FilterSection title={t('discover.section.environment')}>
          <EnvironmentFilter
            selected={values.environment}
            onChange={(selected) => onChange({ environment: selected.join(',') || undefined })}
          />
        </FilterSection>
      )}

      {showLicense && (
        <FilterSection title={t('discover.section.license')}>
          <LicenseFilter
            openSource={values.openSource}
            onChange={(openSource) => onChange({ openSource: openSource ? 'true' : undefined })}
          />
        </FilterSection>
      )}

      <FilterSection title={t('discover.section.advanced')} defaultOpen={false}>
        <p className="px-1.5 py-1 text-[13px] text-subtle">{t('discover.section.advanced.hint')}</p>
      </FilterSection>
    </aside>
  )
}
