import { Children, type ComponentPropsWithoutRef, type ReactNode, createElement, useEffect, useRef } from 'react'
import { useMotionEnabled } from './useMotionEnabled'

/**
 * Time after the children first appear during which the stagger hook stays on. It covers the longest
 * delay (9 steps of 25 ms) plus the fade (220 ms) with some margin. After it, the attribute is removed, so
 * cards added later by a filter or a reload do not animate in again.
 */
const PLAY_WINDOW_MS = 600

interface StaggerProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** The element to render. Use "ul" or "ol" for lists; the direct children are the items. */
  as?: 'div' | 'ul' | 'ol'
  children: ReactNode
}

/**
 * Lays the direct children in with a fade-up, 25 ms apart; the first 10 items are staggered and later ones
 * use the delay of the tenth. The CSS lives in styles.css (.volt-stagger[data-stagger]), so the children keep
 * their own markup and layout. It plays once per mount: re-renders do not replay it, and items added after
 * the play window are shown at once.
 */
export function Stagger({ as = 'div', children, className, ...rest }: StaggerProps) {
  const enabled = useMotionEnabled()
  const ref = useRef<HTMLElement>(null)
  const scheduled = useRef(false)
  const hasChildren = Children.toArray(children).length > 0

  useEffect(() => {
    // Only the first commit with children starts the timer; the timer removes the hook (not the animation
    // already running on the children). No cleanup: StrictMode runs effects twice and must not cancel it.
    if (!hasChildren || scheduled.current) return
    scheduled.current = true
    window.setTimeout(() => ref.current?.removeAttribute('data-stagger'), PLAY_WINDOW_MS)
  }, [hasChildren])

  return createElement(
    as,
    { ...rest, ref, className: `volt-stagger ${className ?? ''}`.trim(), 'data-stagger': enabled ? 'play' : undefined },
    children
  )
}
