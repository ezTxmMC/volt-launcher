import type { ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { useI18n } from '@/i18n'
import { Button } from './Button'

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return <Icon icon="lucide:loader-circle" className={`animate-spin text-subtle ${className}`} />
}

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-subtle" role="status">
      <Spinner className="size-5" />
      <span>{label ?? t('common.loading')}</span>
    </div>
  )
}

/** Determinate progress bar; pass `value` in 0..1, or null for an indeterminate bar. */
export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(value * 100)}
      className="h-1 w-full overflow-hidden rounded-full bg-line"
    >
      {value === null ? (
        <div className="volt-indeterminate h-full w-1/3 rounded-full bg-accent" />
      ) : (
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
        />
      )}
    </div>
  )
}

/** Old discover empty state: centred icon, title and hint, no border. */
export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <Icon icon={icon} className="size-10 text-fg/15" />
      <h3 className="text-[15px] font-semibold text-subtle">{title}</h3>
      {description && <p className="max-w-md text-[13px] text-subtle/80">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n()
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-danger-text">
      <Icon icon="lucide:circle-alert" className="size-5 shrink-0" />
      <p className="min-w-0 flex-1 break-words">{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} icon="lucide:refresh-cw">
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}
