import type { GameVersion, SyncPackAutoLoader, SyncPackAutoVersions, SyncPackEntry, SyncPackKind } from '@shared/models'
import { SYNC_PACK_KINDS } from '@shared/models'

/** The loaders an automatic profile can use, in the order of the select. */
export const SYNC_AUTO_LOADERS: ReadonlyArray<{ id: SyncPackAutoLoader; label: string }> = [
  { id: 'fabric', label: 'Fabric' },
  { id: 'quilt', label: 'Quilt' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' }
]

/** How many of the newest releases the manual create row offers. */
export const CREATE_VERSION_LIMIT = 20

/** The settings may come from an older backend without these keys, so every read falls back to a valid value. */
export function autoLoaderOrDefault(value: unknown): SyncPackAutoLoader {
  return SYNC_AUTO_LOADERS.find((loader) => loader.id === value)?.id ?? 'fabric'
}

export function autoVersionsOrDefault(value: unknown): SyncPackAutoVersions {
  return value === 'snapshots' ? 'snapshots' : 'release'
}

/** Keeps only non-empty strings (pack ids). */
export function packIdsOrEmpty(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id !== '')
}

/** Two id lists are the same when they hold the same ids, ignoring the order. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

/** The newest release versions, newest first, at most CREATE_VERSION_LIMIT of them. */
export function newestReleases(versions: readonly GameVersion[]): GameVersion[] {
  return versions
    .filter((version) => version.type === 'release')
    .sort((a, b) => (Date.parse(b.releaseTime) || 0) - (Date.parse(a.releaseTime) || 0))
    .slice(0, CREATE_VERSION_LIMIT)
}

/** Number of entries per kind, in SYNC_PACK_KINDS order. */
export function countByKind(entries: readonly SyncPackEntry[]): Array<{ kind: SyncPackKind; count: number }> {
  return SYNC_PACK_KINDS.map((kind) => ({ kind, count: entries.filter((entry) => entry.kind === kind).length }))
}

/** Identifies an entry: the same project of the same provider is one entry. */
export const entryKey = (entry: SyncPackEntry | undefined): string => `${entry?.provider ?? ''}:${entry?.projectId ?? ''}`
