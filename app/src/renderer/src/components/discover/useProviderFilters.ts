import { useCallback } from 'react'
import { LOADERS } from '@shared/models'
import type { ContentKind, ProviderFilters, ProviderId, SortOption } from '@shared/models'
import { api, errorMessage } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { isMissingEndpoint, usesLoader } from './filters/model'
import type { ResolvedFilters } from './filters/model'

interface FiltersLoad {
  /** `provider|kind` this result belongs to; a result for another pair is ignored. */
  key: string
  filters?: ResolvedFilters
  error?: string
}

function fromBackend(raw: ProviderFilters): ResolvedFilters {
  return {
    sorts: raw.sorts ?? [],
    categories: raw.categories ?? [],
    gameVersions: raw.gameVersions ?? [],
    loaders: raw.loaders ?? [],
    supports: raw.supports
  }
}

/**
 * A backend from before the filters endpoint: the categories it already serves, the sorts of the
 * provider summary, and the default loaders. Game versions are then a free text field.
 */
async function legacyFilters(
  providerId: ProviderId,
  kind: ContentKind,
  providerSorts: readonly SortOption[]
): Promise<ResolvedFilters> {
  const categories = await api.providers.categories(providerId, kind).catch(() => [] as string[])
  const loader = usesLoader(kind)
  const sorts = providerSorts.map((id) => ({ id, label: id }))
  return {
    sorts,
    categories: categories.map((name) => ({ id: name, label: name })),
    gameVersions: [],
    loaders: loader ? LOADERS.filter((candidate) => candidate !== 'vanilla') : [],
    supports: {
      search: true,
      kind: true,
      sort: sorts.length > 0,
      categories: categories.length > 0,
      gameVersion: true,
      loader,
      paging: true
    }
  }
}

/**
 * Filter lists and supported controls of one provider for one kind. Pass no provider while the
 * provider is not configured: nothing is requested then.
 */
export function useProviderFilters(
  providerId: ProviderId | undefined,
  kind: ContentKind | undefined,
  providerSorts: readonly SortOption[]
): { filters: ResolvedFilters | undefined; error: string | null; loading: boolean; reload: () => void } {
  const key = providerId && kind ? `${providerId}|${kind}` : ''

  const load = useCallback(async (): Promise<FiltersLoad> => {
    if (!providerId || !kind) return { key: '' }
    let raw: ProviderFilters
    try {
      raw = await api.providers.filters(providerId, kind)
    } catch (error) {
      const message = errorMessage(error)
      if (!isMissingEndpoint(message)) return { key, error: message }
      return { key, filters: await legacyFilters(providerId, kind, providerSorts) }
    }
    return { key, filters: fromBackend(raw) }
  }, [providerId, kind, key, providerSorts])

  const { data, reload } = useAsync(load)
  const current = data && data.key === key ? data : undefined
  return {
    filters: current?.filters,
    error: current?.error ?? null,
    loading: key !== '' && current === undefined,
    reload
  }
}
