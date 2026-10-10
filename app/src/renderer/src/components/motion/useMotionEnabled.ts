import { useSyncExternalStore } from 'react'
import { useSettings } from '@/state/settings'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function reducedMotionNow(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/** True when the OS asks for reduced motion. Follows changes while the app is open. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => false)
}

/**
 * True when animations are allowed: the Animations setting is on and the OS does not ask for reduced motion.
 * The CSS motion tokens in styles.css reach the same result (data-no-animations on <html>, set by
 * applyAppearance from the same setting, and the reduced-motion media query), so JS only decides whether to
 * add the animation hooks at all.
 */
export function useMotionEnabled(): boolean {
  const { settings } = useSettings()
  const reduced = useReducedMotion()
  return settings.animationsEnabled && !reduced
}
