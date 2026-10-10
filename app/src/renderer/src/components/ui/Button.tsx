import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from '@iconify/react'

/**
 * primary: the old UI's tinted action button (preactive state of VoltButton).
 * launch: solid blue call-to-action, used for Play.
 * secondary: neutral button (old cancel / utility buttons).
 * ghost: transparent button (old nav items).
 * danger: old stop button.
 */
type Variant = 'primary' | 'launch' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] border font-semibold tracking-[0.07em] transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] enabled:active:scale-[var(--motion-press)] disabled:cursor-not-allowed disabled:opacity-50'

const VARIANTS: Record<Variant, string> = {
  primary:
    'border-[var(--accent-border-strong)] bg-accent-soft-strong text-accent hover:bg-accent-soft-hover hover:shadow-[var(--shadow-accent-md)]',
  launch:
    'border-[var(--accent-border-strong)] bg-accent font-bold tracking-[0.07em] text-white shadow-[var(--shadow-accent-md)] hover:shadow-[var(--shadow-accent-lg)] hover:bg-accent-hover',
  secondary: 'border-line bg-surface-3 text-muted hover:bg-line hover:text-fg',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-surface-3 hover:text-fg',
  danger: 'border-danger/25 bg-danger-soft text-danger-text hover:shadow-[0_0_5px_rgb(255_95_87/0.5)]'
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12px]',
  md: 'h-9 px-3.5 text-[13.5px]'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Iconify icon name shown before the label. */
  icon?: string
  loading?: boolean
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Icon icon="lucide:loader-circle" className="size-[13px] animate-spin" />
      ) : icon ? (
        <Icon icon={icon} className="size-[13px]" />
      ) : null}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string
  /** Required: accessible name and tooltip. */
  label: string
}

/** Square icon button, as the old TopBar buttons (size-8, border, bg-white/5). */
export function IconButton({ icon, label, className = '', type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`grid size-8 shrink-0 place-items-center rounded-[7px] border border-line bg-surface-3 text-subtle transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] enabled:active:scale-[var(--motion-press)] hover:bg-line hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      <Icon icon={icon} className="size-[14px]" />
    </button>
  )
}
