import type { GameVersion } from '@shared/models'

export type VersionFilter = 'releases' | 'snapshots' | 'all'
export const VERSION_FILTERS: readonly VersionFilter[] = ['releases', 'snapshots', 'all']

export type VersionView = 'grid' | 'list'

const VIEW_KEY = 'volt.createProfile.versionView'

/** "Releases" asks the backend for releases only; the other two filters also need snapshots. */
export function includeSnapshotsFor(filter: VersionFilter): boolean {
  return filter !== 'releases'
}

export function matchesFilter(version: GameVersion, filter: VersionFilter): boolean {
  if (filter === 'releases') return version.type === 'release'
  if (filter === 'snapshots') return version.type !== 'release'
  return true
}

/** Text search: a version matches when its id contains the (lower-case, trimmed) query. */
export function matchesText(version: GameVersion, query: string): boolean {
  return query === '' || version.id.toLowerCase().includes(query)
}

/** The minor line of a version: "1.21" and "1.21.4" are both in line "1.21"; other ids (snapshots) are their own line. */
export function lineKeyOf(id: string): string {
  const parts = id.split('.')
  if (parts.length >= 2 && parts.every((part) => /^\d+$/.test(part))) return `${parts[0]}.${parts[1]}`
  return id
}

/** The art family of a line; each one has its own palette in versionArt.ts. */
export type VersionCategory = 'year' | 'v1_21' | 'v1_20' | 'v1_19' | 'v1_18' | 'v1_17' | 'v1_16' | 'older' | 'snapshot'

/**
 * The category of a line. `key` is the line key from lineKeyOf, `type` the version type of its
 * own version. "26.x" (year-based) and "1.21" .. "1.16" are grouped by their numbers, lines below
 * 1.16 are "older", and any other id is a snapshot (old alpha and beta ids count as older).
 */
export function categoryOf(key: string, type: string): VersionCategory {
  const parts = key.split('.')
  if (parts.length === 2 && parts.every((part) => /^\d+$/.test(part))) {
    const major = Number(parts[0])
    const minor = Number(parts[1])
    if (major >= 26) return 'year'
    if (major === 1 && minor >= 21) return 'v1_21'
    if (major === 1 && minor === 20) return 'v1_20'
    if (major === 1 && minor === 19) return 'v1_19'
    if (major === 1 && minor === 18) return 'v1_18'
    if (major === 1 && minor === 17) return 'v1_17'
    if (major === 1 && minor === 16) return 'v1_16'
    return 'older'
  }
  if (type === 'release' || type.startsWith('old_')) return 'older'
  return 'snapshot'
}

export interface VersionLine {
  /** The big number on the tile. */
  key: string
  category: VersionCategory
  /** Selected by a click on the tile: the line's own version, else its newest patch. */
  primary: GameVersion
  /** Every version of the line, in list order (the list order of the backend is newest first). */
  members: GameVersion[]
  /** The patch versions shown as chips: all members except the line's own version. */
  patches: GameVersion[]
}

/** Groups the versions into minor lines in list order. */
export function groupLines(versions: readonly GameVersion[]): VersionLine[] {
  const groups = new Map<string, GameVersion[]>()
  for (const version of versions) {
    const key = lineKeyOf(version.id)
    const members = groups.get(key)
    if (members) members.push(version)
    else groups.set(key, [version])
  }
  const lines: VersionLine[] = []
  for (const [key, members] of groups) {
    const primary = members.find((member) => member.id === key) ?? members[0]
    if (!primary) continue
    lines.push({
      key,
      category: categoryOf(key, primary.type),
      primary,
      members,
      patches: members.filter((member) => member.id !== key)
    })
  }
  return lines
}

/** Remembers the grid/list choice; storage can be unavailable, then the default applies. */
export function readVersionView(): VersionView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    // Storage unavailable (private window or blocked site data): the tiles are the default.
    return 'grid'
  }
}

export function writeVersionView(view: VersionView): void {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Storage unavailable: the choice then lasts for this dialog only.
  }
}
