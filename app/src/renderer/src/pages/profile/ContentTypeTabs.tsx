import { useCallback, useState } from 'react'
import type { Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { ContentPanel } from '@/components/content/ContentPanel'
import { Field, Select } from '@/components/ui/Field'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'

/** Resource packs of the profile's resourcepacks folder. */
export function ResourcePacksTab({ profile }: { profile: Profile }) {
  return <ContentPanel profile={profile} type="resourcepacks" />
}

/** Shader packs of the profile's shaderpacks folder. */
export function ShaderPacksTab({ profile }: { profile: Profile }) {
  return <ContentPanel profile={profile} type="shaderpacks" />
}

/**
 * Data packs. Minecraft keeps them inside a world (saves/<world>/datapacks), so the tab
 * first picks the world and lists that world's packs.
 */
export function DataPacksTab({ profile }: { profile: Profile }) {
  const { t } = useI18n()
  const load = useCallback(() => api.content.worlds(profile.id), [profile.id])
  const { data, error, loading, reload } = useAsync(load)
  const [chosen, setChosen] = useState('')

  if (error) return <ErrorNotice message={error} onRetry={reload} />
  if (!data && loading) return <LoadingBlock />
  const worlds = data?.worlds ?? []
  if (worlds.length === 0) {
    return <p className="py-10 text-center text-muted">{t('content.noWorlds')}</p>
  }
  const selected = worlds.some((world) => world.folder === chosen) ? chosen : (worlds[0]?.folder ?? '')
  return (
    <div className="grid gap-4">
      <Field label={t('content.world')} hint={t('content.worldHint')}>
        <Select value={selected} onChange={(event) => setChosen(event.target.value)}>
          {worlds.map((world) => (
            <option key={world.folder} value={world.folder}>
              {world.folder} ({world.datapacks})
            </option>
          ))}
        </Select>
      </Field>
      <ContentPanel key={selected} profile={profile} type="datapacks" world={selected} />
    </div>
  )
}
