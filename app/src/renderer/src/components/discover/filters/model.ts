import type { ContentKind, FilterOption, FilterSupport, Loader } from '@shared/models'
import type { MessageKey } from '@/i18n'
import { LOADER_COLORS, LOADER_NAMES } from '@/lib/labels'

/** The filter values one provider offers for one kind, as the discover UI reads them. */
export interface ResolvedFilters {
  sorts: FilterOption[]
  categories: FilterOption[]
  gameVersions: string[]
  loaders: string[]
  supports: FilterSupport
}

export const DEFAULT_SORT = 'relevance'

/** Labels of the sort ids the app knows; a sort id it does not know shows the backend's label. */
export const SORT_LABELS: Record<string, MessageKey> = {
  relevance: 'discover.sort.relevance',
  downloads: 'discover.sort.downloads',
  follows: 'discover.sort.follows',
  newest: 'discover.sort.newest',
  updated: 'discover.sort.updated',
  popular: 'discover.sort.popular',
  name: 'discover.sort.name'
}

/** Loaders only narrow mods and modpacks; packs and shaders are loader-independent. */
export function usesLoader(kind: ContentKind): boolean {
  return kind === 'mod' || kind === 'modpack'
}

export function sortLabel(option: FilterOption, translate: (key: MessageKey) => string): string {
  const key = SORT_LABELS[option.id]
  return key ? translate(key) : option.label
}

export function loaderLabel(id: string): string {
  return LOADER_NAMES[id as Loader] ?? id
}

/** Loaders offered as a filter: vanilla is not a mod loader, so it is never listed. */
export function loaderChoices(loaders: readonly string[]): string[] {
  return loaders.filter((loader) => loader !== 'vanilla')
}

export function loaderColor(id: string): string {
  return LOADER_COLORS[id as Loader] ?? LOADER_COLORS.unknown
}

/** Small icon per loader (iconify lucide names). */
const LOADER_ICONS: Record<string, string> = {
  fabric: 'lucide:scroll',
  quilt: 'lucide:layers',
  forge: 'lucide:hammer',
  neoforge: 'lucide:flame'
}

export function loaderIcon(id: string): string {
  return LOADER_ICONS[id] ?? 'lucide:puzzle'
}

/** Small icon per Modrinth category (iconify lucide names). */
const CATEGORY_ICONS: Record<string, string> = {
  adventure: 'lucide:compass',
  cursed: 'lucide:skull',
  decoration: 'lucide:paintbrush',
  economy: 'lucide:coins',
  equipment: 'lucide:sword',
  food: 'lucide:apple',
  'game-mechanics': 'lucide:cog',
  library: 'lucide:book-open',
  magic: 'lucide:wand-sparkles',
  management: 'lucide:briefcase',
  minigame: 'lucide:gamepad-2',
  mobs: 'lucide:rabbit',
  optimization: 'lucide:zap',
  social: 'lucide:message-circle',
  storage: 'lucide:archive',
  technology: 'lucide:cpu',
  transportation: 'lucide:truck',
  utility: 'lucide:wrench',
  worldgen: 'lucide:globe'
}

export function categoryIcon(id: string): string {
  return CATEGORY_ICONS[id] ?? 'lucide:tag'
}

/** "game-mechanics" reads as "Game mechanics". */
export function categoryLabel(option: FilterOption): string {
  const text = option.label.replace(/[-_]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function parseList(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : []
}

/** An older backend has no filters endpoint; the bridge reports that as "no such endpoint". */
export function isMissingEndpoint(message: string): boolean {
  return /no such endpoint|not_found|HTTP 404/i.test(message)
}

/** Network-level failures of the backend's provider requests. */
export function isOfflineMessage(message: string): boolean {
  return /offline|network|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|failed to fetch|could not resolve/i.test(
    message
  )
}
