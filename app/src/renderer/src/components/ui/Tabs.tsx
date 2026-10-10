import { useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'

export interface TabItem<T extends string> {
  id: T
  label: string
  icon?: string
  badge?: number
}

interface PillBox {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Old NavButton look: rounded-[7px] pill, accent tint when active. The tint is one pill behind the tabs that
 * slides to the active tab (volt-tab-indicator), so the change of tab is a move, not a jump.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label
}: {
  items: readonly TabItem<T>[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<PillBox | null>(null)

  // Measure the active tab after layout, and again whenever the list or a tab changes size.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = (): void => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]')
      if (!active) {
        setPill(null)
        return
      }
      setPill({ left: active.offsetLeft, top: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    list.querySelectorAll<HTMLElement>('[role="tab"]').forEach((tab) => observer.observe(tab))
    return () => observer.disconnect()
  }, [value, items])

  return (
    <div ref={listRef} role="tablist" aria-label={label} className="relative flex flex-wrap gap-2">
      {pill && (
        <span
          aria-hidden="true"
          className="volt-tab-indicator"
          style={{ left: pill.left, top: pill.top, width: pill.width, height: pill.height }}
        />
      )}
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`relative inline-flex items-center gap-[7px] rounded-[7px] border px-4 py-2 text-[14px] font-semibold tracking-[0.08em] whitespace-nowrap transition-colors duration-[var(--motion-base)] ${
              active ? 'border-transparent text-fg' : 'border-transparent bg-transparent text-muted hover:bg-white/5 hover:text-fg'
            }`}
          >
            {item.icon && <Icon icon={item.icon} className={`size-[13px] ${active ? 'text-accent' : ''}`} />}
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span className="rounded-full bg-accent-soft px-1.5 text-xs leading-5 text-accent">{item.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
