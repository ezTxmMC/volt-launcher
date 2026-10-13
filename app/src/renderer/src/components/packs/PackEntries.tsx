import { Icon } from '@iconify/react'
import type { SyncPackEntry, SyncPackKind } from '@shared/models'
import { SYNC_PACK_KINDS } from '@shared/models'
import { useI18n } from '@/i18n'
import { KIND_ICONS, KIND_LABELS, PROVIDER_NAMES } from '@/lib/labels'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { entryKey } from './options'

/** The project icon of an entry, or the kind's icon when there is none. */
export function EntryIcon({ url, kind }: { url: string | null; kind: SyncPackKind }) {
  return (
    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-white/5 text-fg/30">
      {url ? (
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : (
        <Icon icon={KIND_ICONS[kind]} className="size-4" />
      )}
    </span>
  )
}

/**
 * The entries of a pack grouped by kind: icon, name, provider badge and a remove button.
 * `busy` disables the buttons while a change is saved.
 */
export function PackEntryGroups({
  entries,
  busy,
  onRemove
}: {
  entries: readonly SyncPackEntry[]
  busy: boolean
  onRemove: (entry: SyncPackEntry) => void
}) {
  const { t } = useI18n()
  return (
    <div className="grid gap-4">
      {SYNC_PACK_KINDS.map((kind) => {
        const group = entries.filter((entry) => entry.kind === kind)
        if (group.length === 0) return null
        return (
          <div key={kind} className="grid gap-1.5">
            <h4 className="flex items-center gap-2 text-[13px] font-semibold text-muted">
              <Icon icon={KIND_ICONS[kind]} className="size-[14px] text-subtle" />
              {t(KIND_LABELS[kind])}
              <span className="text-subtle tabular-nums">{group.length}</span>
            </h4>
            <ul className="grid gap-1.5">
              {group.map((entry) => (
                <li
                  key={entryKey(entry)}
                  className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-surface-input-muted px-2.5 py-1.5"
                >
                  <EntryIcon url={entry.iconUrl} kind={entry.kind} />
                  <span className="min-w-0 flex-1 truncate font-medium" title={entry.name}>
                    {entry.name}
                  </span>
                  <Badge tone="neutral">{PROVIDER_NAMES[entry.provider]}</Badge>
                  <IconButton
                    icon="lucide:x"
                    label={t('syncpacks.editor.remove', { name: entry.name })}
                    disabled={busy}
                    onClick={() => onRemove(entry)}
                    className="hover:text-danger"
                  />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
