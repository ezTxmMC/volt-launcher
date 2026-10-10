import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useSettings } from '@/state/settings'

/**
 * Container of one wizard step. It slides in from the side the user moves towards and fades in.
 * Skipped when the app's animations are off or the system asks for reduced motion.
 * The parent gives it a `key` per step, so every step mounts and animates again.
 */
export function StepPanel({ direction, children }: { direction: 1 | -1; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { settings } = useSettings()
  const animate = settings.animationsEnabled

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !animate || typeof element.animate !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const offset = 18 * direction
    element.animate(
      [
        { opacity: 0, transform: `translateX(${offset}px)` },
        { opacity: 1, transform: 'translateX(0)' }
      ],
      { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    )
  }, [direction, animate])

  return (
    <div ref={ref} className="grid min-w-0 gap-4">
      {children}
    </div>
  )
}
