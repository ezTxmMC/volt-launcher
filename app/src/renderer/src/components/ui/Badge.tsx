import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '@iconify/react'

export type Tone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'

/** Chip styles from the old discover cards and detail panel. */
const TONES: Record<Tone, string> = {
  neutral: 'bg-white/[0.06] text-subtle',
  accent: 'bg-accent-soft text-accent/80',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger-text'
}

/** Inline colour for loader chips (old: `${colour}1f` background, full colour text). */
export function tintStyle(color: string): CSSProperties {
  return { background: `${color}1f`, color }
}

export function Badge({
  tone = 'neutral',
  icon,
  color,
  capitalize = false,
  children
}: {
  tone?: Tone
  icon?: string
  color?: string
  capitalize?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[12px] leading-4 font-semibold whitespace-nowrap ${
        capitalize ? 'capitalize' : ''
      } ${color ? '' : TONES[tone]}`}
      style={color ? tintStyle(color) : undefined}
    >
      {icon && <Icon icon={icon} className="size-[11px]" />}
      {children}
    </span>
  )
}
