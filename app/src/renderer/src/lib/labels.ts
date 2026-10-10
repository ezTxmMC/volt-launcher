import type { ContentKind, Loader, ProviderId } from '@shared/models'
import type { MessageKey } from '@/i18n'

export const LOADER_NAMES: Record<Loader, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

/** Old discover loader chip colours (inline; background is the colour at 12% alpha). */
export const LOADER_COLORS: Record<Loader | 'unknown', string> = {
  vanilla: '#9aa4c4',
  fabric: '#c9a26d',
  quilt: '#8b61b4',
  forge: '#5b6394',
  neoforge: '#f28f22',
  unknown: '#9aa4c4'
}

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  modrinth: 'Modrinth',
  curseforge: 'CurseForge',
  technic: 'Technic',
  ftb: 'FTB'
}

export const PROVIDER_ICONS: Record<ProviderId, string> = {
  modrinth: 'lucide:leaf',
  curseforge: 'lucide:flame',
  technic: 'lucide:hammer',
  ftb: 'lucide:box'
}

/** Old discover provider tints: applied inline to the active provider tab. */
export const PROVIDER_COLORS: Record<ProviderId, string> = {
  modrinth: '#00C853',
  curseforge: '#FF6D00',
  technic: '#F0A500',
  ftb: '#3AA9F5'
}

/** Plural labels for filters. */
export const KIND_LABELS: Record<ContentKind, MessageKey> = {
  mod: 'kind.mod',
  modpack: 'kind.modpack',
  resourcepack: 'kind.resourcepack',
  shader: 'kind.shader',
  datapack: 'kind.datapack'
}

/** Singular labels for badges. */
export const KIND_LABELS_SINGLE: Record<ContentKind, MessageKey> = {
  mod: 'kindSingle.mod',
  modpack: 'kindSingle.modpack',
  resourcepack: 'kindSingle.resourcepack',
  shader: 'kindSingle.shader',
  datapack: 'kindSingle.datapack'
}

export const KIND_ICONS: Record<ContentKind, string> = {
  mod: 'lucide:puzzle',
  modpack: 'lucide:package',
  resourcepack: 'lucide:palette',
  shader: 'lucide:sparkles',
  datapack: 'lucide:database'
}
