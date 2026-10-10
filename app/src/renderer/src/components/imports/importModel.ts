import type { ImportConfidence, ImportItem, ImportLauncher, Loader } from '@shared/models'
import type { MessageKey } from '@/i18n'
import type { Tone } from '@/components/ui/Badge'

const KNOWN_LOADERS: readonly Loader[] = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge']

/** Maps the launcher's loader id to a loader the badge knows; anything else shows as "unknown". */
export function toLoader(value: string): Loader | 'unknown' {
  return (KNOWN_LOADERS as readonly string[]).includes(value) ? (value as Loader) : 'unknown'
}

/** A stable id for one profile across launchers; the separator cannot occur in launcher ids. */
export function itemId(item: ImportItem): string {
  return `${item.launcher}\u001f${item.key}`
}

/** Every profile that may be picked, in scan order. */
export function importableItems(launchers: readonly ImportLauncher[]): ImportItem[] {
  return launchers.flatMap((launcher) =>
    launcher.profiles.filter((profile) => profile.importable).map((profile) => ({ launcher: launcher.id, key: profile.key }))
  )
}

export const CONFIDENCE_LABELS: Record<ImportConfidence, MessageKey> = {
  verified: 'imports.confidence.verified',
  documented: 'imports.confidence.documented',
  community: 'imports.confidence.community'
}

export const CONFIDENCE_TONES: Record<ImportConfidence, Tone> = {
  verified: 'success',
  documented: 'info',
  community: 'warning'
}
