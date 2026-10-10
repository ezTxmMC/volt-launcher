import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useMotionEnabled } from './useMotionEnabled'

/**
 * Wraps the routed page. Keyed by the pathname, so the wrapper is replaced on every navigation and the
 * fade-up (volt-page, styles.css) plays again. The wrapper is a flex column that fills the content panel,
 * so the page layout does not change.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const enabled = useMotionEnabled()
  return (
    <div key={pathname} className={`flex min-h-0 min-w-0 flex-1 flex-col ${enabled ? 'volt-page' : ''}`}>
      {children}
    </div>
  )
}
