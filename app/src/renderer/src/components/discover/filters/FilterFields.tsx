import { Select } from '@/components/ui/Select'
import { DebouncedInput } from './DebouncedInput'

interface ChoiceFilterProps {
  label: string
  placeholder: string
  value: string
  /** Choices from the provider. Empty: the provider cannot list them, so a free text field is shown. */
  options: readonly string[]
  anyLabel: string
  labelOf?: (id: string) => string
  onChange: (value: string) => void
  className?: string
}

/** A select of the provider's choices, or a text field when the provider lists none. Used by the project page too. */
export function ChoiceFilter({ label, placeholder, value, options, anyLabel, labelOf, onChange, className = 'w-44' }: ChoiceFilterProps) {
  if (options.length === 0) {
    return <DebouncedInput ariaLabel={label} placeholder={placeholder} value={value} onCommit={onChange} className={className} />
  }
  // A value the provider does not list (for example from an old link) stays visible instead of silently changing.
  const choices = value && !options.includes(value) ? [value, ...options] : options
  return (
    <Select<string>
      ariaLabel={label}
      value={value}
      onChange={onChange}
      className={className}
      options={[
        { value: '', label: anyLabel },
        ...choices.map((id) => ({ value: id, label: labelOf ? labelOf(id) : id }))
      ]}
    />
  )
}
