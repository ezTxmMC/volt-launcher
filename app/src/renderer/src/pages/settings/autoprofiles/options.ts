import type { AutoProfileLoader, AutoProfileMod, AutoProfileVersions, GameVersion } from '@shared/models'

/** The loaders an automatic profile can use, in the order of the select. */
export const AUTO_PROFILE_LOADERS: ReadonlyArray<{ id: AutoProfileLoader; label: string }> = [
  { id: 'fabric', label: 'Fabric' },
  { id: 'quilt', label: 'Quilt' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' }
]

/** How many of the newest releases the manual create row offers. */
export const CREATE_VERSION_LIMIT = 20

/** The settings may come from an older backend without these keys, so every read falls back to a valid value. */
export function loaderOrDefault(value: unknown): AutoProfileLoader {
  return AUTO_PROFILE_LOADERS.find((loader) => loader.id === value)?.id ?? 'fabric'
}

export function versionsOrDefault(value: unknown): AutoProfileVersions {
  return value === 'snapshots' ? 'snapshots' : 'release'
}

/** Keeps only entries with a project id; a missing name is replaced by the id. */
export function modsOrEmpty(value: unknown): AutoProfileMod[] {
  if (!Array.isArray(value)) return []
  const mods: AutoProfileMod[] = []
  for (const entry of value as Array<Partial<AutoProfileMod> | null>) {
    if (!entry || typeof entry.projectId !== 'string' || entry.projectId === '') continue
    const name = typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name : entry.projectId
    mods.push({ provider: 'modrinth', projectId: entry.projectId, name })
  }
  return mods
}

/** Two preset lists are the same when they hold the same projects in the same order. */
export function sameMods(a: readonly AutoProfileMod[], b: readonly AutoProfileMod[]): boolean {
  return a.length === b.length && a.every((mod, index) => mod.projectId === b[index]?.projectId && mod.name === b[index]?.name)
}

/** The newest release versions, newest first, at most CREATE_VERSION_LIMIT of them. */
export function newestReleases(versions: readonly GameVersion[]): GameVersion[] {
  return versions
    .filter((version) => version.type === 'release')
    .sort((a, b) => (Date.parse(b.releaseTime) || 0) - (Date.parse(a.releaseTime) || 0))
    .slice(0, CREATE_VERSION_LIMIT)
}
