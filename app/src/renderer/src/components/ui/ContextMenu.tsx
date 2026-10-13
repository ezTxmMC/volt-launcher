import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { leaveThen } from './leave'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: string
  /** Text on the right, e.g. a key combination. A hint only; the menu does not bind it. */
  shortcut?: string
  /** Destructive action, drawn in the danger colour. */
  danger?: boolean
  disabled?: boolean
  /** Tooltip, e.g. why the entry is disabled. */
  title?: string
  onSelect: () => void
}

export interface ContextMenuSeparator {
  id: string
  separator: true
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

export interface ContextMenuProps {
  /** Viewport position in CSS pixels, normally the pointer position of the contextmenu event. */
  x: number
  y: number
  /** Accessible name of the menu. */
  label: string
  items: ContextMenuEntry[]
  onClose: () => void
}

/** Keeps the menu this far from the viewport edges. */
const EDGE = 8

function isSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
  return 'separator' in entry
}

/** Indices of the entries the keyboard can reach: items that are not separators and not disabled. */
function reachable(items: ContextMenuEntry[]): number[] {
  return items.flatMap((entry, index) => (!isSeparator(entry) && !entry.disabled ? [index] : []))
}

/**
 * Floating menu opened at a point, rendered into document.body. It is placed inside the viewport
 * (flipped to the other side of the point when there is no room), closes on Escape, outside
 * pointer or context-menu clicks, scroll, resize and Tab, and is operated with ArrowUp/Down,
 * Home/End and Enter/Space. Focus goes back to the previously focused element on close.
 */
export function ContextMenu({ x, y, label, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  // Dismissing (outside click, Escape, an item, scroll or resize) plays the leave animation first.
  const dismiss = useCallback(() => leaveThen(menuRef.current, onClose), [onClose])
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [active, setActive] = useState<number>(() => reachable(items)[0] ?? -1)

  // Place the menu once it has its real size: flip to the left or upwards when it would leave the viewport.
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const { width, height } = menu.getBoundingClientRect()
    const left = x + width + EDGE > window.innerWidth ? Math.max(EDGE, x - width) : x
    const top = y + height + EDGE > window.innerHeight ? Math.max(EDGE, y - height) : y
    setPosition({ left, top })
  }, [x, y, items.length])

  // Move focus to the active item; with no reachable item, to the menu itself.
  useEffect(() => {
    if (active >= 0) itemRefs.current[active]?.focus({ preventScroll: true })
    else menuRef.current?.focus({ preventScroll: true })
  }, [active])

  // Return focus to whatever opened the menu when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => opener?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onPointerOutside = (event: Event): void => {
      if (!menuRef.current?.contains(event.target as Node)) dismiss()
    }
    const onKey = (event: KeyboardEvent): void => {
      const indices = reachable(items)
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
        return
      }
      if (event.key === 'Tab') {
        dismiss()
        return
      }
      if (indices.length === 0) return
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      setActive((current) => {
        const at = indices.indexOf(current)
        switch (event.key) {
          case 'ArrowDown':
            return indices[at < 0 ? 0 : (at + 1) % indices.length] ?? current
          case 'ArrowUp':
            return indices[at < 0 ? indices.length - 1 : (at - 1 + indices.length) % indices.length] ?? current
          case 'Home':
            return indices[0] ?? current
          default:
            return indices[indices.length - 1] ?? current
        }
      })
    }
    document.addEventListener('pointerdown', onPointerOutside, true)
    document.addEventListener('contextmenu', onPointerOutside, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', onPointerOutside, true)
      document.removeEventListener('contextmenu', onPointerOutside, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [items, dismiss])

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: position?.left ?? x, top: position?.top ?? y, visibility: position ? 'visible' : 'hidden' }}
      className="volt-menu fixed z-[80] grid min-w-[220px] max-w-[calc(100vw-16px)] gap-0.5 rounded-xl border border-[var(--accent-border)] bg-surface-strong p-1.5 shadow-pop backdrop-blur-xl outline-none"
    >
      {items.map((entry, index) => {
        if (isSeparator(entry)) return <div key={entry.id} role="separator" className="my-1 h-px bg-line" />
        const isActive = index === active
        const tint = entry.danger ? (isActive ? 'bg-danger-soft' : '') : isActive ? 'bg-accent-soft' : ''
        return (
          <button
            key={entry.id}
            ref={(element) => {
              itemRefs.current[index] = element
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={entry.disabled}
            title={entry.title}
            onPointerEnter={() => {
              if (!entry.disabled) setActive(index)
            }}
            onClick={() => {
              if (entry.disabled) return
              dismiss()
              entry.onSelect()
            }}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] transition-colors duration-150 outline-none disabled:opacity-50 ${
              entry.danger ? 'text-danger-text' : ''
            } ${tint}`}
          >
            {entry.icon && <Icon icon={entry.icon} className={`size-4 shrink-0 ${entry.danger ? '' : 'text-muted'}`} />}
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.shortcut && <span className="pl-4 text-[12px] text-subtle">{entry.shortcut}</span>}
          </button>
        )
      })}
    </div>,
    document.body
  )
}
