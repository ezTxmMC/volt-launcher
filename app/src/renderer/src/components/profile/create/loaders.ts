import type { Loader } from '@shared/models'
import type { MessageKey } from '@/i18n'

export interface LoaderMeta {
  /** Lucide icon name; the icon subset plugin picks up every `lucide:` name in the sources. */
  icon: string
  description: MessageKey
  /** False when the loader offers no Minecraft version list to pick from (none does today). */
  hasVersionList: boolean
}

/** Metadata of the five loaders the backend supports (the order of LOADERS in shared/models). */
export const LOADER_META: Record<Loader, LoaderMeta> = {
  vanilla: { icon: 'lucide:box', description: 'createProfile.loader.vanilla', hasVersionList: true },
  fabric: { icon: 'lucide:feather', description: 'createProfile.loader.fabric', hasVersionList: true },
  quilt: { icon: 'lucide:layers', description: 'createProfile.loader.quilt', hasVersionList: true },
  forge: { icon: 'lucide:hammer', description: 'createProfile.loader.forge', hasVersionList: true },
  neoforge: { icon: 'lucide:flame', description: 'createProfile.loader.neoforge', hasVersionList: true }
}
