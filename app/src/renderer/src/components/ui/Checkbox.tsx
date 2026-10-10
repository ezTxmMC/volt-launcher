import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from '@iconify/react'

/**
 * Square checkbox with an accent fill and a check (or dash when indeterminate) icon.
 * The real input is visually hidden but stays focusable, so keyboard and screen readers work.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate = false,
  disabled = false,
  icon,
  count,
  className = '',
  id
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  indeterminate?: boolean
  disabled?: boolean
  /** Small icon shown before the label. */
  icon?: ReactNode
  /** Muted number shown on the right, as in the filter lists. */
  count?: number
  className?: string
  id?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  // The indeterminate state exists only as a DOM property.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate
  }, [indeterminate])

  const filled = checked || indeterminate
  return (
    <label
      className={`group inline-flex min-w-0 items-center gap-2.5 text-[15px] text-fg/80 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${className}`}
    >
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 ${
          filled ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong bg-surface-input group-hover:border-accent-line'
        }`}
      >
        {indeterminate ? (
          <Icon icon="lucide:minus" className="size-3" />
        ) : checked ? (
          <Icon icon="lucide:check" className="size-3" />
        ) : null}
      </span>
      {icon && <span className="inline-flex shrink-0 text-muted">{icon}</span>}
      <span className="min-w-0 flex-1">{label}</span>
      {count !== undefined && <span className="shrink-0 pl-2 text-[13px] text-subtle tabular-nums">{count}</span>}
    </label>
  )
}
