import { useState } from 'react'
import { Icon } from '@iconify/react'
import type { SyncPack } from '@shared/models'
import { useI18n } from '@/i18n'
import { useSettings } from '@/state/settings'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Page'
import { PackAutoConfigCard } from './PackAutoConfigCard'
import { PackAutoStatusCard } from './PackAutoStatusCard'

/**
 * "New version -> new profile": a collapsible block on top of the pack page. The option is global (it names
 * packs, not one pack), so it does not belong to the selected pack.
 */
export function PackAutoSection({ packs }: { packs: readonly SyncPack[] }) {
  const { t } = useI18n()
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const enabled = settings.syncPackAutoEnabled === true

  return (
    <div className="grid gap-3">
      <Card className="p-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-3 rounded-xl px-[18px] py-3.5 text-left transition-colors hover:bg-white/[0.03]"
        >
          <Icon icon="lucide:sparkles" className="size-4 shrink-0 text-subtle" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold tracking-[0.12em] text-muted uppercase">{t('syncpacks.auto.title')}</span>
            <span className="block truncate text-[13px] text-subtle">{t('syncpacks.auto.collapsedHint')}</span>
          </span>
          <Badge tone={enabled ? 'success' : 'neutral'} icon={enabled ? 'lucide:check' : 'lucide:circle-slash'}>
            {enabled ? t('syncpacks.status.on') : t('syncpacks.status.off')}
          </Badge>
          <Icon
            icon="lucide:chevron-down"
            className={`size-4 shrink-0 text-subtle transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </Card>
      {open && (
        <div className="grid gap-4 min-[1100px]:grid-cols-2 min-[1100px]:items-start">
          <PackAutoConfigCard packs={packs} />
          <PackAutoStatusCard />
        </div>
      )}
    </div>
  )
}
