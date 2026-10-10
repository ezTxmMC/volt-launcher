import type { ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { useI18n } from '@/i18n'

/**
 * The pages to show: the first and last page, the current page with one neighbour on each side,
 * and "gap" where pages are left out. Page 1 of 3853 gives 1 2 gap 3853, as the reference does.
 */
export function pageEntries(page: number, pages: number): Array<number | 'gap'> {
  const wanted = [...new Set([1, pages, page - 1, page, page + 1])]
    .filter((candidate) => candidate >= 1 && candidate <= pages)
    .sort((a, b) => a - b)
  const entries: Array<number | 'gap'> = []
  wanted.forEach((candidate, index) => {
    const previous = wanted[index - 1]
    if (previous !== undefined && candidate - previous > 1) entries.push('gap')
    entries.push(candidate)
  })
  return entries
}

interface DiscoverPaginationProps {
  page: number
  /** Pages from the total; null when the backend reports no total (then only previous and next are shown). */
  pages: number | null
  hasMore: boolean
  onPage: (page: number) => void
}

export function DiscoverPagination({ page, pages, hasMore, onPage }: DiscoverPaginationProps) {
  const { t } = useI18n()
  const canPrevious = page > 1
  const canNext = pages !== null ? page < pages : hasMore

  return (
    <nav aria-label={t('discover.pages.label')} className="flex items-center gap-0.5">
      <NavButton label={t('discover.pages.previous')} icon="lucide:chevron-left" disabled={!canPrevious} onClick={() => onPage(page - 1)} />
      {pages === null ? (
        <span className="px-2 text-[14px] tabular-nums text-muted" aria-current="page">
          {t('discover.pages.page', { page })}
        </span>
      ) : (
        pageEntries(page, pages).map((entry, index): ReactNode =>
          entry === 'gap' ? (
            <span key={`gap-${index}`} aria-hidden="true" className="grid size-8 place-items-center text-subtle">
              <Icon icon="lucide:ellipsis" className="size-4" />
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              aria-label={t('discover.pages.page', { page: entry })}
              aria-current={entry === page ? 'page' : undefined}
              onClick={() => onPage(entry)}
              className={`min-w-8 rounded-full px-2 py-1 text-[14px] font-semibold tabular-nums transition-colors ${
                entry === page ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-white/[0.06] hover:text-fg'
              }`}
            >
              {entry}
            </button>
          )
        )
      )}
      <NavButton label={t('discover.pages.next')} icon="lucide:chevron-right" disabled={!canNext} onClick={() => onPage(page + 1)} />
    </nav>
  )
}

function NavButton({ label, icon, disabled, onClick }: { label: string; icon: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-fg disabled:cursor-not-allowed disabled:opacity-35"
    >
      <Icon icon={icon} className="size-4" />
    </button>
  )
}
