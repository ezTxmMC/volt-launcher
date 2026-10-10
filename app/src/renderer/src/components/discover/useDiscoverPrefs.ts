import { useCallback, useState } from 'react'

export type DiscoverView = 'list' | 'grid'

export const PER_PAGE_OPTIONS = [10, 20, 50] as const
export const DEFAULT_PER_PAGE = 20

const VIEW_KEY = 'volt.discover.view'
const PER_PAGE_KEY = 'volt.discover.perPage'

// Storage can be unavailable (private windows, blocked site data); the defaults then apply.
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage unavailable: the choice lasts for this visit only
  }
}

export function parseView(value: string | null | undefined): DiscoverView | undefined {
  return value === 'list' || value === 'grid' ? value : undefined
}

/** The result layout last chosen on this machine (list when none). */
export function useStoredView(): [DiscoverView, (view: DiscoverView) => void] {
  const [view, setView] = useState<DiscoverView>(() => parseView(readStored(VIEW_KEY)) ?? 'list')
  const change = useCallback((next: DiscoverView) => {
    setView(next)
    writeStored(VIEW_KEY, next)
  }, [])
  return [view, change]
}

/** The results per page last chosen on this machine (20 when none). */
export function useStoredPerPage(): [number, (perPage: number) => void] {
  const [perPage, setPerPage] = useState<number>(() => {
    const value = Number(readStored(PER_PAGE_KEY))
    return (PER_PAGE_OPTIONS as readonly number[]).includes(value) ? value : DEFAULT_PER_PAGE
  })
  const change = useCallback((next: number) => {
    setPerPage(next)
    writeStored(PER_PAGE_KEY, String(next))
  }, [])
  return [perPage, change]
}
