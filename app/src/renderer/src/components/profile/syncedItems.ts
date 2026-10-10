import type { SyncedItem } from '@shared/models'
import type { MessageKey } from '@/i18n'

/** Where the list is shown: the create wizard or the profile settings. Each has its own i18n keys. */
export type SyncedScope = 'createProfile' | 'profile'

export interface SyncedItemInfo {
  key: SyncedItem
  /** The checkbox or switch label, per scope. */
  label: Record<SyncedScope, MessageKey>
  /** A short line under the label, per scope; only the files have one. */
  hint?: Record<SyncedScope, MessageKey>
}

/**
 * The shared items, in list order. The one source of truth for both the create wizard and the profile settings,
 * so the two lists cannot drift apart. The order matches the backend's synced keys.
 */
export const SYNCED_ITEMS: readonly SyncedItemInfo[] = [
  {
    key: 'shaderpacks',
    label: { createProfile: 'createProfile.synced.shaderpacks', profile: 'profile.synced.shaderpacks' }
  },
  {
    key: 'resourcepacks',
    label: { createProfile: 'createProfile.synced.resourcepacks', profile: 'profile.synced.resourcepacks' }
  },
  {
    key: 'saves',
    label: { createProfile: 'createProfile.synced.saves', profile: 'profile.synced.saves' }
  },
  {
    key: 'screenshots',
    label: { createProfile: 'createProfile.synced.screenshots', profile: 'profile.synced.screenshots' }
  },
  {
    key: 'config',
    label: { createProfile: 'createProfile.synced.config', profile: 'profile.synced.config' }
  },
  {
    key: 'options',
    label: { createProfile: 'createProfile.synced.options', profile: 'profile.synced.options' },
    hint: { createProfile: 'createProfile.synced.options.hint', profile: 'profile.synced.options.hint' }
  },
  {
    key: 'servers',
    label: { createProfile: 'createProfile.synced.servers', profile: 'profile.synced.servers' },
    hint: { createProfile: 'createProfile.synced.servers.hint', profile: 'profile.synced.servers.hint' }
  }
]

