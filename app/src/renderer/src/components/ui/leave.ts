/** Length of the leave animation (volt-leave); matches --motion-fast. */
const LEAVE_MS = 150

/** True when the user turned animations off or the OS asks for less motion: nothing to wait for. */
function motionOff(): boolean {
  return document.documentElement.hasAttribute('data-no-animations') || window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Plays the leave animation on an element (data-leaving), then runs `done`. With motion off, `done`
 * runs at once. A second call while leaving is ignored, so a double click closes only once.
 */
export function leaveThen(element: HTMLElement | null, done: () => void): void {
  if (!element || motionOff()) {
    done()
    return
  }
  if (element.dataset.leaving) return
  element.dataset.leaving = 'true'
  window.setTimeout(done, LEAVE_MS)
}
