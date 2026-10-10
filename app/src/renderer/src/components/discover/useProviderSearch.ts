import { useEffect, useState } from 'react'
import type { ContentKind, ProjectSummary, ProviderId, SearchResult } from '@shared/models'
import { api, errorMessage } from '@/lib/api'
import type { SearchParams } from '@/lib/api'

/** One search page. Only the fields the provider honours are set; the caller leaves the rest out. */
export interface SearchRequest {
  provider: ProviderId
  kind: ContentKind
  q: string
  gameVersion?: string
  loader?: string
  categories: string[]
  sort?: string
  environment?: string
  openSource?: boolean
  /** 1-based page; the offset is (page - 1) * limit. */
  page: number
  limit: number
}

interface SearchState {
  /** The request this state answers. */
  key: string
  items: ProjectSummary[]
  /** Null when the backend does not report a total. */
  total: number | null
  hasMore: boolean
  error: string | null
}

export interface SearchView {
  items: ProjectSummary[]
  total: number | null
  hasMore: boolean
  error: string | null
  /** True until the answer for the current request has arrived. */
  loading: boolean
  /** Items shown are the previous page's, kept visible (dimmed) while the new page loads. */
  stale: boolean
  reload: () => void
}

function paramsOf(request: SearchRequest): SearchParams {
  return {
    q: request.q,
    kind: request.kind,
    gameVersion: request.gameVersion,
    loader: request.loader,
    categories: request.categories.join(',') || undefined,
    sort: request.sort,
    environment: request.environment || undefined,
    openSource: request.openSource ? 'true' : undefined,
    offset: (request.page - 1) * request.limit,
    limit: request.limit
  }
}

function hasMoreOf(result: SearchResult, offset: number, limit: number): boolean {
  if (typeof result.hasMore === 'boolean') return result.hasMore
  if (typeof result.total === 'number') return offset + result.items.length < result.total
  return result.items.length >= limit
}

/**
 * One page of a paged search. Every request (provider, filters, page, page size) is its own answer;
 * the previous answer stays on screen, marked stale, until the new one arrives.
 */
export function useProviderSearch(request: SearchRequest | null): SearchView {
  // The request is compared by value: the caller builds a new object on every render.
  const key = request ? JSON.stringify(request) : ''
  const [state, setState] = useState<SearchState | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!key) return
    const current = JSON.parse(key) as SearchRequest
    let cancelled = false
    api.providers.search(current.provider, paramsOf(current)).then(
      (result) => {
        if (cancelled) return
        const offset = (current.page - 1) * current.limit
        setState({
          key,
          items: result.items,
          total: typeof result.total === 'number' ? result.total : null,
          hasMore: hasMoreOf(result, offset, current.limit),
          error: null
        })
      },
      (error: unknown) => {
        if (!cancelled) setState({ key, items: [], total: null, hasMore: false, error: errorMessage(error) })
      }
    )
    return () => {
      cancelled = true
    }
  }, [key, tick])

  const visible = request ? state : null
  const current = visible && visible.key === key ? visible : null

  return {
    items: visible?.items ?? [],
    total: visible?.total ?? null,
    hasMore: visible?.hasMore ?? false,
    error: current?.error ?? null,
    loading: request !== null && current === null,
    stale: request !== null && current === null && visible !== null,
    reload: () => {
      setState(null)
      setTick((value) => value + 1)
    }
  }
}
