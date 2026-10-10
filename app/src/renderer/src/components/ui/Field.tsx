import {
  Children,
  Fragment,
  createContext,
  isValidElement,
  useContext,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes
} from 'react'
import { Select as SelectControl, type SelectOption } from './Select'

/** Old input look: border-white/10, surface-input, focus accent-border-focus. */
const CONTROL =
  'rounded-lg border border-line bg-surface-input text-fg outline-none transition-colors placeholder:text-subtle focus:border-[var(--accent-focus)] disabled:opacity-50'

/** The caption of the enclosing Field, used as the accessible name of a Select inside it. */
const FieldLabelContext = createContext('')

/** Old form label: small uppercase tracked caption (CreateProfileModal). */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <FieldLabelContext.Provider value={label}>
      <label className="grid gap-1.5">
        <span className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{label}</span>
        {children}
        {hint && <span className="text-[12px] leading-[1.5] text-subtle">{hint}</span>}
      </label>
    </FieldLabelContext.Provider>
  )
}

export function TextInput({ className = 'w-full', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-10 px-[13px] text-[15px] ${CONTROL} ${className}`} {...rest} />
}

/** Plain text of option children, including arrays and fragments. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

/** Turns <option> children (the native API the call sites use) into the options of the custom Select. */
function optionsFrom(children: ReactNode): SelectOption<string>[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<ComponentProps<'option'>>(child)) return []
    if (child.type === Fragment) return optionsFrom(child.props.children)
    const label = textOf(child.props.children)
    const value = child.props.value !== undefined ? String(child.props.value) : label
    return [{ value, label, disabled: child.props.disabled }]
  })
}

interface FieldSelectProps {
  value: string
  /** Callers read only event.target.value, so the custom Select passes that shape. */
  onChange: (event: { target: { value: string } }) => void
  children: ReactNode
  className?: string
  disabled?: boolean
}

/** Select with the native <option> children API, rendered by the custom Select (labelled by the Field caption). */
export function Select({ className = 'w-full', value, onChange, children, disabled }: FieldSelectProps) {
  const label = useContext(FieldLabelContext)
  return (
    <SelectControl
      value={value}
      options={optionsFrom(children)}
      ariaLabel={label}
      className={className}
      disabled={disabled}
      onChange={(next) => onChange({ target: { value: next } })}
    />
  )
}

export function TextArea({ className = 'w-full', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-20 px-[13px] py-2 text-[15px] ${CONTROL} ${className}`} {...rest} />
}
