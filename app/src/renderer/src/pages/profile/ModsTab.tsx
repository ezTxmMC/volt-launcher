import type { Profile } from '@shared/models'
import { ContentPanel } from '@/components/content/ContentPanel'

/** The mods tab: the content panel for mods (toggle, updates, versions, dependency warnings). */
export function ModsTab({ profile }: { profile: Profile }) {
  return <ContentPanel profile={profile} type="mods" />
}
