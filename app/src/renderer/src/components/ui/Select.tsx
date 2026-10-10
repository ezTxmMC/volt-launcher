import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'

export interface SelectOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
  icon?: ReactNode
}

export interface SelectProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SelectOption<T>>
  /** Accessible name of the trigger and of the listbox. */
  ariaLabel: string
  size?: 'sm' | 'md'
  /** Applied to the root, so widths are set here (the root is block-level and full width by default). */
  className?: string
  disabled?: boolean
  id?: string
  /** Shown on the trigger when no option matches the value. */
  placeholder?: string
}

/** Where the list sits: position fixed inside its container, above or below the trigger. */
interface Placement {
  /** The open <dialog> around the trigger, or document.body. */
  container: HTMLElement
  left: number
  width: number
  maxHeight: number
  top: number | undefined
  bottom: number | undefined
}

const EDGE = 8
const GAP = 4
const ITEM_HEIGHT = 36
const LIST_PADDING = 8
const MAX_LIST_HEIGHT = 320
const MIN_WIDTH = 160
const TYPEAHEAD_MS = 600

const SIZES = { sm: 'h-8 px-2.5 text-[13px]', md: 'h-10 px-3 text-[15px]' } as const

/**
 * Where a fixed element's containing block starts in viewport coordinates. The dialog has
 * backdrop-filter, which makes it the containing block of position: fixed descendants, so the
 * list must be offset by the dialog's padding box. For document.body the origin is the viewport.
 */
function originOf(container: HTMLElement): { x: number; y: number; bottom: number } {
  if (container === document.body) return { x: 0, y: 0, bottom: window.innerHeight }
  const box = container.getBoundingClientRect()
  const x = box.left + container.clientLeft
  const y = box.top + container.clientTop
  return { x, y, bottom: y + container.clientHeight }
}

/** Position for the trigger rectangle: below when it fits or has more room than above, otherwise above. Coordinates are local to origin. */
function placeList(rect: DOMRect, count: number, origin: ReturnType<typeof originOf>): Omit<Placement, 'container'> {
  const wanted = Math.min(MAX_LIST_HEIGHT, count * ITEM_HEIGHT + LIST_PADDING)
  const roomBelow = window.innerHeight - rect.bottom - EDGE
  const roomAbove = rect.top - EDGE
  const below = roomBelow >= wanted || roomBelow >= roomAbove
  const width = Math.min(Math.max(rect.width, MIN_WIDTH), window.innerWidth - EDGE * 2)
  const left = Math.min(Math.max(rect.left, EDGE), window.innerWidth - width - EDGE)
  const maxHeight = Math.max(0, Math.min(wanted, below ? roomBelow : roomAbove))
  return {
    left: left - origin.x,
    width,
    maxHeight,
    top: below ? rect.bottom + GAP - origin.y : undefined,
    bottom: below ? undefined : origin.bottom - (rect.top - GAP)
  }
}

/** Index of the first enabled option from start in the given direction, or -1. */
function enabledFrom<T extends string>(options: ReadonlyArray<SelectOption<T>>, start: number, step: 1 | -1): number {
  for (let index = start; index >= 0 && index < options.length; index += step) {
    if (!options[index]?.disabled) return index
  }
  return -1
}

/**
 * Custom dropdown replacing the native <select>: a rounded trigger and a listbox with a check mark
 * on the selected option. Keyboard: Arrow keys, Home/End, Enter/Space, Escape and typing to jump.
 * The list is portalled into the open <dialog> when the trigger is inside one, because a modal
 * dialog makes everything outside it inert; otherwise it goes to document.body.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'md',
  className,
  disabled = false,
  id,
  placeholder
}: SelectProps<T>) {
  const reactId = useId()
  const listId = `${reactId}-list`
  const optionPrefix = `${reactId}-option-`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typeahead = useRef({ text: '', at: 0 })
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [active, setActive] = useState(-1)
  const isOpen = placement !== null

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const openList = (): void => {
    const trigger = triggerRef.current
    if (!trigger || disabled || options.length === 0) return
    const container = trigger.closest('dialog') ?? document.body
    setPlacement({
      container,
      ...placeList(trigger.getBoundingClientRect(), options.length, originOf(container))
    })
    const selectedUsable = selectedIndex >= 0 && !options[selectedIndex]?.disabled
    setActive(selectedUsable ? selectedIndex : enabledFrom(options, 0, 1))
  }

  const close = (restoreFocus: boolean): void => {
    setPlacement(null)
    if (restoreFocus) triggerRef.current?.focus()
  }

  const choose = (index: number): void => {
    const option = options[index]
    if (!option || option.disabled) return
    if (option.value !== value) onChange(option.value)
    close(true)
  }

  // Focus moves into the list when it opens.
  useEffect(() => {
    if (isOpen) listRef.current?.focus({ preventScroll: true })
  }, [isOpen])

  // The highlighted option stays visible while the keyboard moves it.
  useEffect(() => {
    if (isOpen) document.getElementById(`${optionPrefix}${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, active, optionPrefix])

  // A press outside closes the list; scrolling or resizing moves it along with the trigger.
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return
      setPlacement(null)
    }
    const reposition = (event: Event): void => {
      const trigger = triggerRef.current
      // Scrolling inside the list itself does not move it; resize events target window, not a node.
      if (!trigger || (event.target instanceof Node && listRef.current?.contains(event.target))) return
      const rect = trigger.getBoundingClientRect()
      setPlacement((current) =>
        current ? { ...current, ...placeList(rect, options.length, originOf(current.container)) } : current
      )
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [isOpen, options.length])

  const move = (start: number, step: 1 | -1): void => {
    const next = enabledFrom(options, start, step)
    if (next >= 0) setActive(next)
  }

  // Typing a word jumps to the next option starting with it; repeating one letter cycles those options.
  const typeaheadSearch = (key: string): void => {
    const now = Date.now()
    const buffer = typeahead.current
    buffer.text = (now - buffer.at > TYPEAHEAD_MS ? '' : buffer.text) + key.toLowerCase()
    buffer.at = now
    const repeated = [...buffer.text].every((char) => char === buffer.text[0])
    const term = repeated ? (buffer.text[0] ?? '') : buffer.text
    const count = options.length
    const base = Math.max(active, 0)
    const offset = repeated ? 1 : 0
    for (let step = 0; step < count; step++) {
      const index = (base + offset + step) % count
      const option = options[index]
      if (option && !option.disabled && option.label.toLowerCase().startsWith(term)) {
        setActive(index)
        return
      }
    }
  }

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    const { key } = event
    if (key === 'Tab') {
      // Not prevented: focus is on the trigger by now, so Tab continues from there.
      close(true)
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (key === 'Escape') {
      // Stops the enclosing modal dialog from closing as well.
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault()
      choose(active)
    } else if (key === 'ArrowDown') {
      event.preventDefault()
      move(active + 1, 1)
    } else if (key === 'ArrowUp') {
      event.preventDefault()
      move(active - 1, -1)
    } else if (key === 'Home') {
      event.preventDefault()
      move(0, 1)
    } else if (key === 'End') {
      event.preventDefault()
      move(options.length - 1, -1)
    } else if (key.length === 1) {
      event.preventDefault()
      typeaheadSearch(key)
    }
  }

  return (
    <div className={`relative block min-w-0 ${className ?? ''}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        disabled={disabled}
        onClick={() => (isOpen ? close(true) : openList())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!isOpen) openList()
          }
        }}
        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-surface-input text-left text-fg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 ${
          isOpen ? 'border-[var(--accent-focus)]' : 'border-line hover:border-line-strong focus-visible:border-[var(--accent-focus)]'
        } ${SIZES[size]}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.icon}
          <span className={`truncate ${selected ? '' : 'text-subtle'}`}>{selected?.label ?? placeholder ?? ''}</span>
        </span>
        <Icon
          icon="lucide:chevron-down"
          className={`size-4 shrink-0 text-subtle transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {placement &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={active >= 0 ? `${optionPrefix}${active}` : undefined}
            onKeyDown={onListKeyDown}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null
              if (!next || !(triggerRef.current?.contains(next) || listRef.current?.contains(next))) setPlacement(null)
            }}
            style={{
              left: placement.left,
              width: placement.width,
              maxHeight: placement.maxHeight,
              top: placement.top,
              bottom: placement.bottom
            }}
            className="fixed z-[1000] overflow-y-auto overscroll-contain rounded-lg border border-[var(--accent-border)] bg-surface-strong p-1 text-[14px] text-fg shadow-pop backdrop-blur-xl outline-none"
          >
            {options.map((option, index) => {
              const isSelected = index === selectedIndex
              const isActive = index === active
              return (
                <li
                  key={option.value}
                  id={`${optionPrefix}${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  onMouseEnter={() => {
                    if (!option.disabled) setActive(index)
                  }}
                  onClick={() => choose(index)}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-2 leading-5 select-none ${
                    option.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                  } ${isActive && !option.disabled ? 'bg-accent-soft' : ''}`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {isSelected && <Icon icon="lucide:check" className="size-4 shrink-0 text-accent" />}
                </li>
              )
            })}
          </ul>,
          placement.container
        )}
    </div>
  )
}
