import { useI18n } from '@/i18n'
import { KIND_LABELS } from '@/lib/labels'
import type { SyncPack } from '@shared/models'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { countByKind } from './options'

/** One pack in the list: name, entries per kind, linked profiles and the actions. */
export function SyncPackCard({
  pack,
  syncBusy,
  onEdit,
  onRename,
  onDelete,
  onSync
}: {
  pack: SyncPack
  /** Another sync job runs; the apply button waits for it. */
  syncBusy: boolean
  onEdit: () => void
  onRename: () => void
  onDelete: () => void
  onSync: () => void
}) {
  const { t } = useI18n()
  const linked = pack.profiles.length
  const cannotSync = linked === 0

  return (
    <article className="flex h-full flex-col gap-3 rounded-[10px] border border-line bg-surface-2 p-4">
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-[15px] font-bold">{pack.name}</h4>
          <p className="text-[12px] text-subtle tabular-nums">
            {linked > 0 ? t('syncpacks.card.profiles', { count: linked }) : t('syncpacks.card.none')}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <IconButton icon="lucide:file-pen" label={t('syncpacks.card.rename')} onClick={onRename} />
          <IconButton icon="lucide:trash-2" label={t('syncpacks.card.delete')} onClick={onDelete} />
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {countByKind(pack.entries).map(({ kind, count }) => (
          <Badge key={kind} tone={count > 0 ? 'accent' : 'neutral'}>
            <span className="tabular-nums">{count}</span> {t(KIND_LABELS[kind])}
          </Badge>
        ))}
      </div>
      {pack.entries.length === 0 && <p className="text-[13px] text-subtle">{t('syncpacks.card.empty')}</p>}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button size="sm" variant="ghost" icon="lucide:list-checks" onClick={onEdit}>
          {t('syncpacks.card.edit')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon="lucide:refresh-cw"
          disabled={cannotSync || syncBusy}
          title={cannotSync ? t('syncpacks.card.syncHint') : undefined}
          onClick={onSync}
        >
          {t('syncpacks.card.sync')}
        </Button>
      </footer>
    </article>
  )
}
