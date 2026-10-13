import { Icon } from '@iconify/react'
import { useI18n } from '@/i18n'
import type { SyncJobSummary } from '@/lib/syncResult'
import { hasOutcome } from '@/lib/syncResult'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'

/**
 * The outcome of a link or sync job: counts of installed, overridden and removed entries, then every skipped
 * reason, so nothing that did not arrive stays unexplained. `profileNames` turns profile ids into names.
 */
export function SyncResultSummary({
  summary,
  profileNames,
  onDismiss
}: {
  summary: SyncJobSummary
  profileNames?: ReadonlyMap<string, string>
  onDismiss?: () => void
}) {
  const { t } = useI18n()
  const nameOf = (id: string | null): string => (id ? (profileNames?.get(id) ?? id) : '')
  const nothing = !hasOutcome(summary)
  const perProfile = summary.applies.length > 1

  return (
    <section
      aria-live="polite"
      className="grid gap-2.5 rounded-[10px] border border-[var(--accent-border)] bg-accent-soft px-3.5 py-3"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[12px] font-bold tracking-[0.14em] text-muted uppercase">{t('syncpacks.summary.title')}</span>
          {nothing ? (
            <span className="text-[13px] text-muted">{t('syncpacks.summary.nothing')}</span>
          ) : (
            <>
              <Badge tone="success" icon="lucide:check">
                {t('syncpacks.summary.installed', { count: summary.installed })}
              </Badge>
              <Badge tone={summary.overridden > 0 ? 'warning' : 'neutral'} icon="lucide:shield">
                {t('syncpacks.summary.overridden', { count: summary.overridden })}
              </Badge>
              <Badge tone="neutral" icon="lucide:trash-2">
                {t('syncpacks.summary.removed', { count: summary.removed })}
              </Badge>
            </>
          )}
        </div>
        {onDismiss && <IconButton icon="lucide:x" label={t('common.close')} onClick={onDismiss} className="size-7" />}
      </header>

      {perProfile && (
        <ul className="grid gap-1 text-[13px] text-muted">
          {summary.applies.map((apply, index) => (
            <li key={`${apply.profileId ?? 'profile'}-${index}`} className="flex flex-wrap gap-x-2">
              <span className="font-medium text-fg/80">{nameOf(apply.profileId)}</span>
              <span className="tabular-nums">
                {t('syncpacks.summary.line', {
                  installed: apply.installed.length,
                  overridden: apply.overridden.length,
                  removed: apply.removed.length
                })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {summary.busyProfiles.length > 0 && (
        <p className="flex items-start gap-2 text-[13px] text-warning">
          <Icon icon="lucide:circle-alert" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t('syncpacks.summary.busy', { profiles: summary.busyProfiles.map((id) => nameOf(id)).join(', ') })}
        </p>
      )}

      {summary.skipped.length > 0 && (
        <div className="grid gap-1">
          <p className="text-[13px] font-medium text-warning">
            {t('syncpacks.summary.skipped', { count: summary.skipped.length })}
          </p>
          <ul className="grid max-h-40 gap-1 overflow-y-auto overscroll-contain pl-1 text-[13px] text-muted">
            {summary.skipped.map((reason, index) => (
              <li key={index} className="flex gap-2 break-words">
                <Icon icon="lucide:minus" className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                <span className="min-w-0">{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
