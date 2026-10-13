import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import type { SyncPack, SyncPackEntry } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useToast } from '@/state/toast'
import { entryKey } from '@/components/packs/options'
import { PackEntryGroups } from '@/components/packs/PackEntries'
import { PackPicker } from '@/components/packs/PackPicker'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Feedback'

/**
 * The entries of one pack by kind, with an inline picker (search Modrinth or CurseForge, one click adds).
 * Every change is saved at once with PATCH; the versions are not stored, each profile resolves them on apply.
 */
export function PackContentTab({ pack, onChanged }: { pack: SyncPack; onChanged: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [entries, setEntries] = useState<SyncPackEntry[]>(pack.entries)
  const [picking, setPicking] = useState(pack.entries.length === 0)
  const [busy, setBusy] = useState(false)

  // A reload (or another change) of the pack replaces the local copy.
  useEffect(() => setEntries(pack.entries), [pack.entries])

  const save = async (next: SyncPackEntry[], announce: string): Promise<void> => {
    setBusy(true)
    try {
      const saved = await api.syncpacks.update(pack.id, { entries: next })
      setEntries(saved.entries)
      toast.success(announce)
      onChanged()
    } catch (error) {
      toast.error(error)
      throw error
    } finally {
      setBusy(false)
    }
  }

  const add = (entry: SyncPackEntry): Promise<void> =>
    save(
      entries.some((existing) => entryKey(existing) === entryKey(entry)) ? entries : [...entries, entry],
      t('syncpacks.content.added', { name: entry.name })
    ).catch(() => undefined)

  const remove = (entry: SyncPackEntry): void => {
    void save(
      entries.filter((existing) => entryKey(existing) !== entryKey(entry)),
      t('syncpacks.content.removed', { name: entry.name })
    ).catch(() => undefined)
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">
          {t('syncpacks.editor.entries', { count: entries.length })}
        </span>
        <Button
          size="sm"
          variant={picking ? 'secondary' : 'primary'}
          icon={picking ? 'lucide:chevron-up' : 'lucide:plus'}
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
        >
          {picking ? t('syncpacks.picker.close') : t('syncpacks.editor.add')}
        </Button>
      </div>

      {picking && <PackPicker selected={entries} onAdd={add} disabled={busy} />}

      {entries.length === 0 ? (
        !picking && <EmptyState icon="lucide:package-open" title={t('syncpacks.content.empty.title')} description={t('syncpacks.editor.empty')} />
      ) : (
        <PackEntryGroups entries={entries} busy={busy} onRemove={remove} />
      )}

      <p className="flex items-start gap-2 text-[12.5px] leading-[1.6] text-subtle">
        <Icon icon="lucide:info" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {t('syncpacks.content.hint')}
      </p>
    </div>
  )
}
