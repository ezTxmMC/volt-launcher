import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Feedback'
import type { DiscoverView } from './useDiscoverPrefs'

const SKELETON_COUNT = 6

/** Placeholder rows or cards with the shape of the results, shown while the first page loads. */
export function ResultSkeleton({ view }: { view: DiscoverView }) {
  const { t } = useI18n()
  const items = Array.from({ length: SKELETON_COUNT }, (_, index) => index)
  return (
    <div role="status" aria-label={t('discover.searching')} className={view === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3' : 'grid gap-2'}>
      {items.map((index) =>
        view === 'grid' ? (
          <div key={index} className="flex min-h-[180px] flex-col gap-3 rounded-xl border border-line bg-surface p-4" aria-hidden="true">
            <div className="flex items-start gap-3">
              <div className="size-12 shrink-0 volt-skeleton rounded-lg bg-white/[0.06]" />
              <div className="grid flex-1 gap-2 pt-1">
                <div className="h-3.5 w-3/4 volt-skeleton rounded bg-white/[0.08]" />
                <div className="h-3 w-1/3 volt-skeleton rounded bg-white/[0.05]" />
              </div>
            </div>
            <div className="grid gap-2">
              <div className="h-3 volt-skeleton rounded bg-white/[0.05]" />
              <div className="h-3 w-5/6 volt-skeleton rounded bg-white/[0.05]" />
            </div>
            <div className="mt-auto h-3 w-1/4 volt-skeleton rounded bg-white/[0.05]" />
          </div>
        ) : (
          <div key={index} className="flex gap-4 rounded-xl border border-line bg-surface p-3.5" aria-hidden="true">
            <div className="size-16 shrink-0 volt-skeleton rounded-xl bg-white/[0.06]" />
            <div className="grid flex-1 content-start gap-2 pt-1">
              <div className="h-3.5 w-1/2 volt-skeleton rounded bg-white/[0.08]" />
              <div className="h-3 w-11/12 volt-skeleton rounded bg-white/[0.05]" />
              <div className="h-3 w-2/3 volt-skeleton rounded bg-white/[0.05]" />
              <div className="mt-1 h-4 w-1/3 volt-skeleton rounded bg-white/[0.04]" />
            </div>
          </div>
        )
      )}
    </div>
  )
}

/** Placeholder of the filter sidebar while the provider's filter lists load. */
export function SidebarSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-2 max-[1099px]:hidden self-start">
      {[0, 1, 2].map((index) => (
        <div key={index} className="h-12 volt-skeleton rounded-xl border border-line bg-surface" />
      ))}
    </div>
  )
}

/** Shown instead of an error text when the machine or the provider is unreachable. */
export function OfflineState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <EmptyState
      icon="lucide:wifi-off"
      title={t('discover.offline.title')}
      description={t('discover.offline.description')}
      action={
        <Button variant="secondary" icon="lucide:refresh-cw" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      }
    />
  )
}
