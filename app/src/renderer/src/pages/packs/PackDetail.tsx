import { useState } from 'react'
import type { SyncPack } from '@shared/models'
import { useI18n } from '@/i18n'
import { KIND_LABELS } from '@/lib/labels'
import { countByKind } from '@/components/packs/options'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Page'
import { Tabs } from '@/components/ui/Tabs'
import type { TabItem } from '@/components/ui/Tabs'
import { PackContentTab } from './PackContentTab'
import { PackDiscoverTab } from './PackDiscoverTab'
import { PackProfilesTab } from './PackProfilesTab'

type TabId = 'content' | 'discover' | 'profiles'

/** The selected pack: its name and counts, rename and delete, and the tabs "Inhalt", "Entdecken" and "Profile". */
export function PackDetail({
  pack,
  onChanged,
  onRename,
  onDelete
}: {
  pack: SyncPack
  onChanged: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const [tab, setTab] = useState<TabId>('content')
  const items: readonly TabItem<TabId>[] = [
    { id: 'content', label: t('syncpacks.tab.content'), icon: 'lucide:list-checks', badge: pack.entries.length },
    { id: 'discover', label: t('syncpacks.tab.discover'), icon: 'lucide:search' },
    { id: 'profiles', label: t('syncpacks.tab.profiles'), icon: 'lucide:layers', badge: pack.profiles.length }
  ]

  return (
    <Card className="grid min-w-0 content-start gap-4">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-bold" title={pack.name}>
            {pack.name}
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {countByKind(pack.entries).map(({ kind, count }) => (
              <Badge key={kind} tone={count > 0 ? 'accent' : 'neutral'}>
                <span className="tabular-nums">{count}</span> {t(KIND_LABELS[kind])}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <IconButton icon="lucide:file-pen" label={t('syncpacks.card.rename')} onClick={onRename} />
          <IconButton icon="lucide:trash-2" label={t('syncpacks.card.delete')} onClick={onDelete} className="hover:text-danger" />
        </div>
      </header>

      <Tabs items={items} value={tab} label={pack.name} onChange={setTab} />

      {tab === 'content' && <PackContentTab key={pack.id} pack={pack} onChanged={onChanged} />}
      {tab === 'discover' && <PackDiscoverTab key={pack.id} pack={pack} onChanged={onChanged} />}
      {tab === 'profiles' && <PackProfilesTab key={pack.id} pack={pack} onChanged={onChanged} />}
    </Card>
  )
}
