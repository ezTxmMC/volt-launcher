import type { ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { Card } from '@/components/ui/Page'
import { Switch } from '@/components/ui/Switch'

/** Segmented choice (the old radio-like pill buttons, as in the theme and language choice). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false
}: {
  value: T
  options: ReadonlyArray<{ id: T; label: string }>
  onChange: (value: T) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2 justify-self-start">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          disabled={disabled}
          onClick={() => onChange(option.id)}
          className={`rounded-lg border px-3.5 py-1.5 text-[13.5px] font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
            option.id === value
              ? 'border-[var(--accent-border-active)] bg-accent-soft-strong text-accent'
              : 'border-line bg-white/[0.03] text-muted hover:bg-white/[0.07]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** One settings section: an uppercase heading, an optional hint and the controls. */
export function SettingsCard({
  title,
  hint,
  icon,
  children
}: {
  title: string
  hint?: string
  icon?: string
  children: ReactNode
}) {
  return (
    <Card className="grid gap-5">
      <div className="grid gap-1">
        <h3 className="flex items-center gap-2 text-[13px] font-bold tracking-[0.12em] text-muted uppercase">
          {icon && <Icon icon={icon} className="size-[13px] text-subtle" />}
          {title}
        </h3>
        {hint && <p className="text-[13px] text-subtle">{hint}</p>}
      </div>
      {children}
    </Card>
  )
}

/** A label with an explanation on the left and a switch on the right. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled = false
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        {hint && <p className="text-[13px] text-subtle">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  )
}

/** Small caption above a control, as the old settings field labels. */
export function FieldCaption({ children }: { children: ReactNode }) {
  return <span className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{children}</span>
}
