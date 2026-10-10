import { useCallback } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { ProfileAvatar } from '@/components/ProfileCard'
import { BackupsPanel } from '@/components/saves/BackupsPanel'
import { LogsPanel } from '@/components/saves/LogsPanel'
import { ScreenshotsPanel } from '@/components/saves/ScreenshotsPanel'
import { ServersPanel } from '@/components/saves/ServersPanel'
import { WorldsPanel } from '@/components/saves/WorldsPanel'
import { Page } from '@/components/ui/Page'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { type TabItem, Tabs } from '@/components/ui/Tabs'

type TabId = 'worlds' | 'servers' | 'screenshots' | 'logs' | 'backups'

const TAB_IDS: readonly TabId[] = ['worlds', 'servers', 'screenshots', 'logs', 'backups']

function tabFrom(value: string | null): TabId {
  return TAB_IDS.find((id) => id === value) ?? 'worlds'
}

/** Game data of one profile: worlds, multiplayer servers, screenshots, logs and backups. */
export function SavesPage() {
  const { t } = useI18n()
  const { id = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const tab = tabFrom(search.get('tab'))

  const load = useCallback(() => api.profiles.get(id), [id])
  const { data: profile, error, reload } = useAsync(load)

  if (!profile || profile.id !== id) {
    return (
      <Page>
        <Link to={`/profiles/${encodeURIComponent(id)}`} className="inline-flex items-center gap-1 text-muted hover:text-fg">
          {t('saves.back')}
        </Link>
        {error ? <ErrorNotice message={error} onRetry={reload} /> : <LoadingBlock />}
      </Page>
    )
  }

  const tabs: readonly TabItem<TabId>[] = [
    { id: 'worlds', label: t('saves.tab.worlds'), icon: 'lucide:map' },
    { id: 'servers', label: t('saves.tab.servers'), icon: 'lucide:globe' },
    { id: 'screenshots', label: t('saves.tab.screenshots'), icon: 'lucide:image' },
    { id: 'logs', label: t('saves.tab.logs'), icon: 'lucide:file-text' },
    { id: 'backups', label: t('saves.tab.backups'), icon: 'lucide:archive' }
  ]

  return (
    <Page>
      <div className="grid gap-4">
        <Link
          to={`/profiles/${encodeURIComponent(profile.id)}`}
          className="inline-flex w-fit items-center gap-1 text-muted hover:text-fg"
        >
          {t('saves.back')}
        </Link>
        <div className="flex min-w-0 items-center gap-4">
          <ProfileAvatar name={profile.name} size="lg" />
          <div className="min-w-0">
            <p className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{t('saves.title')}</p>
            <h2 className="truncate text-[19px] font-bold tracking-[0.1em] uppercase">{profile.name}</h2>
          </div>
        </div>
      </div>

      <Tabs
        items={tabs}
        value={tab}
        label={t('saves.title')}
        onChange={(next) => setSearch(next === 'worlds' ? {} : { tab: next }, { replace: true })}
      />

      {tab === 'worlds' && <WorldsPanel profile={profile} />}
      {tab === 'servers' && <ServersPanel profile={profile} />}
      {tab === 'screenshots' && <ScreenshotsPanel profile={profile} />}
      {tab === 'logs' && <LogsPanel profile={profile} />}
      {tab === 'backups' && <BackupsPanel profile={profile} />}
    </Page>
  )
}
