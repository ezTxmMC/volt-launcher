import { useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import type { ProjectSummary } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { DiscoverBrowser } from '@/components/discover/DiscoverBrowser'
import { InstallButton } from '@/components/discover/InstallButton'
import { QuickAddButton } from '@/components/discover/ProjectResults'
import { useInstallTarget } from '@/components/discover/useInstallTarget'
import { CONTENT_TYPE_OF, useProfileInstall } from '@/components/discover/useProfileInstall'
import { Page } from '@/components/ui/Page'
import { Select } from '@/components/ui/Select'

/**
 * Global Discover. The header names the install target ("Installieren in"); with a target, every mod, resource
 * pack and shader installs with one click and shows "Installiert" once the profile has it. Without one the "+"
 * asks for a profile. `?profile=<id>` preselects the target (the profile's Discover tab links here).
 */
export function DiscoverPage() {
  const { t } = useI18n()
  const [targetId, chooseTarget] = useInstallTarget()
  const loadProfiles = useCallback(() => api.profiles.list(), [])
  const { data: profiles } = useAsync(loadProfiles)
  const target = profiles?.find((profile) => profile.id === targetId)
  const install = useProfileInstall(target)

  const options = useMemo(
    () => [
      { value: '', label: t('discover.target.none') },
      ...(profiles ?? []).map((profile) => ({
        value: profile.id,
        label: `${profile.name} (${profile.minecraftVersion}, ${profile.loader})`
      }))
    ],
    [profiles, t]
  )

  const renderAction = (project: ProjectSummary) => {
    // Without a target (and for data packs, which need a world) the profile is asked for in a dialog.
    if (!target || !CONTENT_TYPE_OF[project.kind] || project.kind === 'datapack') {
      return <QuickAddButton project={project} className="relative" />
    }
    const vanillaMod = project.kind === 'mod' && target.loader === 'vanilla'
    return (
      <InstallButton
        state={install.stateOf(project)}
        profileName={target.name}
        disabledReason={vanillaMod ? t('discover.noLoader') : undefined}
        onInstall={() => void install.install(project)}
      />
    )
  }

  return (
    <Page>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3">
        <span className="inline-flex items-center gap-2 text-[13px] font-bold tracking-[0.12em] text-muted uppercase">
          <Icon icon="lucide:download" className="size-[13px] text-subtle" aria-hidden="true" />
          {t('discover.target.label')}
        </span>
        <Select<string>
          ariaLabel={t('discover.target.label')}
          size="sm"
          value={target ? target.id : ''}
          onChange={chooseTarget}
          options={options}
          className="w-72 max-w-full"
        />
        <p className="min-w-0 flex-1 basis-64 text-[12.5px] leading-[1.5] text-subtle">
          {target ? t('discover.target.hint', { profile: target.name }) : t('discover.target.hintNone')}
        </p>
      </div>
      <DiscoverBrowser renderAction={renderAction} profileId={target?.id} />
    </Page>
  )
}
