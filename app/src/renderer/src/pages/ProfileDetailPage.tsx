import { useCallback } from 'react'
import { Icon } from '@iconify/react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { LoaderBadge } from '@/components/Badges'
import { ProfileLogo } from '@/components/profile/logo/ProfileLogo'
import { Badge } from '@/components/ui/Badge'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Page } from '@/components/ui/Page'
import { type TabItem, Tabs } from '@/components/ui/Tabs'
import { ModsTab } from './profile/ModsTab'
import { DataPacksTab, ResourcePacksTab, ShaderPacksTab } from './profile/ContentTypeTabs'
import { ModpackTab } from './profile/ModpackTab'
import { OverviewTab } from './profile/OverviewTab'
import { PlayControls } from './profile/PlayControls'
import { SettingsTab } from './profile/SettingsTab'

type TabId = 'overview' | 'mods' | 'resourcepacks' | 'shaderpacks' | 'datapacks' | 'modpack' | 'settings'

const TAB_IDS: readonly TabId[] = ['overview', 'mods', 'resourcepacks', 'shaderpacks', 'datapacks', 'modpack', 'settings']

export function ProfileDetailPage() {
  const { t } = useI18n()
  const { id = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const requested = search.get('tab')
  const tab: TabId = TAB_IDS.find((item) => item === requested) ?? 'overview'

  const load = useCallback(() => api.profiles.get(id), [id])
  const { data: profile, error, reload } = useAsync(load)

  const tabs: readonly TabItem<TabId>[] = [
    { id: 'overview', label: t('profile.tab.overview'), icon: 'lucide:sliders-horizontal' },
    { id: 'mods', label: t('profile.tab.mods'), icon: 'lucide:puzzle' },
    { id: 'resourcepacks', label: t('profile.tab.resourcepacks'), icon: 'lucide:image' },
    { id: 'shaderpacks', label: t('profile.tab.shaderpacks'), icon: 'lucide:sparkles' },
    { id: 'datapacks', label: t('profile.tab.datapacks'), icon: 'lucide:database' },
    { id: 'modpack', label: t('profile.tab.modpack'), icon: 'lucide:package' },
    { id: 'settings', label: t('profile.tab.settings'), icon: 'lucide:settings' }
  ]

  if (!profile || profile.id !== id) {
    return (
      <Page>
        <Link to="/profiles" className="inline-flex items-center gap-1 text-muted hover:text-fg">
          {t('profile.back')}
        </Link>
        {error ? <ErrorNotice message={error} onRetry={reload} /> : <LoadingBlock />}
      </Page>
    )
  }

  return (
    <Page>
      <div className="grid gap-4">
        <Link to="/profiles" className="inline-flex w-fit items-center gap-1 text-muted hover:text-fg">
          {t('profile.back')}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <ProfileLogo profile={profile} variant="header" />
            <div className="min-w-0">
              <h2 className="truncate text-[19px] font-bold tracking-[0.1em] uppercase">{profile.name}</h2>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge icon="lucide:gamepad-2">{profile.minecraftVersion}</Badge>
                <LoaderBadge loader={profile.loader} />
                {profile.loaderVersion && <Badge>{profile.loaderVersion}</Badge>}
              </div>
            </div>
          </div>
          <PlayControls profile={profile} onChanged={reload} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          items={tabs}
          value={tab}
          label={profile.name}
          onChange={(next) => setSearch(next === 'overview' ? {} : { tab: next }, { replace: true })}
        />
        {/* Own page with worlds, servers, screenshots, logs and backups. */}
        <Link
          to={`/profiles/${encodeURIComponent(profile.id)}/saves`}
          className="inline-flex items-center gap-[7px] rounded-[7px] border border-transparent px-4 py-2 text-[14px] font-semibold tracking-[0.08em] whitespace-nowrap text-muted transition-all duration-200 hover:bg-white/5 hover:text-fg"
        >
          <Icon icon="lucide:archive" className="size-[13px]" />
          {t('profile.tab.saves')}
        </Link>
      </div>

      {tab === 'overview' && <OverviewTab profile={profile} onChanged={reload} />}
      {tab === 'mods' && <ModsTab profile={profile} />}
      {tab === 'resourcepacks' && <ResourcePacksTab profile={profile} />}
      {tab === 'shaderpacks' && <ShaderPacksTab profile={profile} />}
      {tab === 'datapacks' && <DataPacksTab key={profile.id} profile={profile} />}
      {tab === 'modpack' && <ModpackTab key={profile.id} profile={profile} />}
      {tab === 'settings' && <SettingsTab key={profile.id} profile={profile} onChanged={reload} />}
    </Page>
  )
}
