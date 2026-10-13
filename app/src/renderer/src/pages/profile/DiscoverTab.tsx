import { useCallback, useState } from 'react'
import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router'
import type { ContentKind, Profile, ProjectSummary } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { loaderLabel } from '@/components/discover/filters/model'
import { DiscoverBrowser } from '@/components/discover/DiscoverBrowser'
import { InstallButton } from '@/components/discover/InstallButton'
import { useProfileInstall } from '@/components/discover/useProfileInstall'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'

/** What a profile can install: modpacks create their own profile, so they are not offered here. */
const KINDS: readonly ContentKind[] = ['mod', 'resourcepack', 'shader', 'datapack']

/**
 * Discover scoped to one profile: Minecraft version and loader come from the profile, and every result installs
 * straight into it. Projects the profile already has show "Installiert".
 */
export function DiscoverTab({ profile }: { profile: Profile }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const loadWorlds = useCallback(() => api.content.worlds(profile.id), [profile.id])
  const worlds = useAsync(loadWorlds)
  const [chosen, setChosen] = useState('')
  const worldList = worlds.data?.worlds ?? []
  const world = worldList.some((entry) => entry.folder === chosen) ? chosen : (worldList[0]?.folder ?? '')
  const install = useProfileInstall(profile, world || undefined)
  const vanilla = profile.loader === 'vanilla'

  const renderAction = (project: ProjectSummary) => {
    if (project.kind === 'modpack') return null
    let reason: string | undefined
    if (project.kind === 'mod' && vanilla) reason = t('discover.noLoader')
    else if (project.kind === 'datapack' && !world) reason = t('discover.noWorld')
    return (
      <InstallButton
        state={install.stateOf(project)}
        profileName={profile.name}
        disabledReason={reason}
        onInstall={() => void install.install(project)}
      />
    )
  }

  const scopeBar = (kind: ContentKind | undefined) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2.5">
      <span className="inline-flex min-w-0 flex-wrap items-center gap-2 text-[13.5px] text-muted">
        <Icon icon="lucide:download" className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
        {t('discover.profileTab.info', { profile: profile.name })}
        <Badge icon="lucide:gamepad-2">{profile.minecraftVersion}</Badge>
        <Badge icon="lucide:puzzle">{vanilla ? t('discover.noLoaderShort') : loaderLabel(profile.loader)}</Badge>
      </span>
      {kind === 'datapack' && (
        <span className="flex items-center gap-2 text-[13.5px] text-muted">
          <span className="whitespace-nowrap">{t('content.world')}:</span>
          {worldList.length > 0 ? (
            <Select<string>
              ariaLabel={t('content.world')}
              size="sm"
              value={world}
              onChange={setChosen}
              options={worldList.map((entry) => ({ value: entry.folder, label: entry.folder }))}
              className="w-48"
            />
          ) : (
            <span className="text-subtle">{worlds.error ? worlds.error : t('content.noWorlds')}</span>
          )}
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        icon="lucide:external-link"
        className="ml-auto"
        onClick={() => void navigate(`/discover?profile=${encodeURIComponent(profile.id)}`)}
      >
        {t('discover.profileTab.openGlobal')}
      </Button>
    </div>
  )

  return (
    <DiscoverBrowser
      kinds={KINDS}
      lock={{ gameVersion: profile.minecraftVersion, loader: vanilla ? null : profile.loader }}
      renderAction={renderAction}
      profileId={profile.id}
      renderScopeBar={scopeBar}
    />
  )
}
