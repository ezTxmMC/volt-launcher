/**
 * Pill switch (40x22) with a knob that slides over: accent track when on, neutral track when off,
 * accent focus ring for keyboard users.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name. */
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-[22px] w-10 shrink-0 items-center rounded-full border px-[3px] outline-none transition-colors duration-[var(--motion-base)] focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'border-transparent bg-accent' : 'border-line-strong bg-surface-3'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-4 rounded-full shadow-sm transition-transform duration-[var(--motion-base)] ease-[var(--motion-ease)] ${
          checked ? 'translate-x-[18px] bg-accent-fg' : 'translate-x-0 bg-subtle'
        }`}
      />
    </button>
  )
}
