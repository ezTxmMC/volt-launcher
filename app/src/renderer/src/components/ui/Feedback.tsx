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

const BAR_HEIGHT = { sm: 'h-1', md: 'h-1.5', lg: 'h-2.5' } as const

/**
 * Progress bar; `value` in 0..1, or null for an indeterminate bar. The fill has an accent gradient and,
 * while running, a moving sheen (stopped by the motion tokens in styles.css). `showPercent` adds the
 * percentage on the right, `caption` a message line below.
 */
export function ProgressBar({
  value,
  label,
  size = 'md',
  showPercent = false,
  caption,
  className = ''
}: {
  value: number | null
  label: string
  size?: 'sm' | 'md' | 'lg'
  showPercent?: boolean
  caption?: string
  className?: string
}) {
  const percent = value === null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100)
  const bar = (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-valuetext={caption}
      className={`volt-progress ${BAR_HEIGHT[size]} w-full min-w-0 overflow-hidden rounded-full bg-line`}
    >
      {value === null ? (
        <div className="volt-progress-fill volt-indeterminate h-full w-1/3 rounded-full" />
      ) : (
        <div
          className="volt-progress-fill h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
        />
      )}
    </div>
  )
  if (!showPercent && !caption) return <div className={className}>{bar}</div>
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-2">
        {bar}
        {showPercent && percent !== null && (
          <span className="w-9 shrink-0 text-right text-[11px] font-semibold text-subtle tabular-nums" aria-hidden="true">
            {percent}%
          </span>
        )}
      </div>
      {caption && (
        <p className="truncate text-[11px] text-subtle" title={caption}>
          {caption}
        </p>
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
