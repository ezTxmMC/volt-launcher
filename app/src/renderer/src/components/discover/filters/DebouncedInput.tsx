import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'

interface DebouncedInputProps {
  value: string
  /** Called once the user stops typing for `delay` ms (or on Enter). Not called for values that come from outside. */
  onCommit: (value: string) => void
  ariaLabel: string
  placeholder?: string
  /** Iconify name shown inside the field, on the left. */
  icon?: string
  delay?: number
  className?: string
}

/**
 * Text field that commits after a short pause, so typing does not rewrite the URL on every key.
 * A value set from outside (reset, provider switch) replaces the draft.
 */
export function DebouncedInput({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  icon,
  delay = 400,
  className = 'w-full'
}: DebouncedInputProps) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }
  const commitRef = useRef(onCommit)
  useEffect(() => {
    commitRef.current = onCommit
  }, [onCommit])

  useEffect(() => {
    if (draft === value) return
    const timer = window.setTimeout(() => commitRef.current(draft), delay)
    return () => window.clearTimeout(timer)
  }, [draft, value, delay])

  return (
    <div className={`relative min-w-0 ${className}`}>
      {icon && (
        <Icon icon={icon} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 z-10 size-[14px] -translate-y-1/2 text-subtle" />
      )}
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && draft !== value) commitRef.current(draft)
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`h-10 w-full rounded-lg border border-line bg-surface-input px-3 text-[15px] text-fg outline-none transition-colors placeholder:text-subtle focus:border-[var(--accent-focus)] ${
          icon ? 'pl-9' : ''
        }`}
      />
    </div>
  )
}
