import { useCallback, useState } from 'react'
import { Icon } from '@iconify/react'
import type { SyncPack, SyncPackEntry, SyncPackKind } from '@shared/models'
import { SYNC_PACK_KINDS } from '@shared/models'
import { useI18n } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { KIND_ICONS, KIND_LABELS, PROVIDER_NAMES } from '@/lib/labels'
import { useToast } from '@/state/toast'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ErrorNotice } from '@/components/ui/Feedback'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { SyncPackPicker } from './SyncPackPicker'
import { entryKey, sameEntries } from './options'

/**
 * Creates a pack (no `pack`) or edits one: the name and the entries, grouped by kind. Saved with one request
 * (POST for a new pack, PATCH for an existing one).
 */
export function SyncPackEditor({
  pack,
  existingNames,
  onClose,
  onSaved
}: {
  pack?: SyncPack
  existingNames: readonly string[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [name, setName] = useState(pack?.name ?? '')
  const [entries, setEntries] = useState<SyncPackEntry[]>(pack?.entries ?? [])
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.trim()
  const duplicate = existingNames.some(
    (existing) => existing.toLowerCase() === trimmed.toLowerCase() && existing !== pack?.name
  )
  const nameProblem = trimmed === '' ? t('syncpacks.name.required') : duplicate ? t('syncpacks.name.taken') : null
  const dirty = pack === undefined || trimmed !== pack.name || !sameEntries(entries, pack.entries)
  const canSave = !saving && nameProblem === null && dirty

  const addEntry = useCallback((entry: SyncPackEntry) => {
    setEntries((current) => (current.some((existing) => entryKey(existing) === entryKey(entry)) ? current : [...current, entry]))
  }, [])

  const removeEntry = (entry: SyncPackEntry): void => {
    setEntries((current) => current.filter((existing) => entryKey(existing) !== entryKey(entry)))
  }

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      if (pack) await api.syncpacks.update(pack.id, { name: trimmed, entries })
      else await api.syncpacks.create(trimmed, entries)
      toast.success(t('settings.saved'))
      onSaved()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={pack ? t('syncpacks.editor.edit') : t('syncpacks.editor.new')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon="lucide:save" loading={saving} disabled={!canSave} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Field label={t('syncpacks.editor.name')} hint={nameProblem ?? t('syncpacks.editor.nameHint')}>
          <TextInput
            value={name}
            maxLength={60}
            placeholder={t('syncpacks.editor.namePlaceholder')}
            aria-invalid={nameProblem !== null || undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">
              {t('syncpacks.editor.entries', { count: entries.length })}
            </span>
            <Button
              size="sm"
              variant="secondary"
              icon="lucide:plus"
              aria-expanded={picking}
              onClick={() => setPicking((open) => !open)}
            >
              {t('syncpacks.editor.add')}
            </Button>
          </div>

          {picking && <SyncPackPicker selected={entries} onAdd={addEntry} onClose={() => setPicking(false)} />}

          {entries.length === 0 ? (
            <p className="rounded-[10px] border border-line bg-surface-input-muted px-3 py-4 text-[13px] text-subtle">
              {t('syncpacks.editor.empty')}
            </p>
          ) : (
            SYNC_PACK_KINDS.map((kind) => {
              const group = entries.filter((entry) => entry.kind === kind)
              return group.length === 0 ? null : <KindGroup key={kind} kind={kind} entries={group} onRemove={removeEntry} />
            })
          )}
        </section>

        <p className="text-[12px] leading-[1.6] text-subtle">{t('syncpacks.editor.hint')}</p>
        {error && <ErrorNotice message={error} />}
      </form>
    </Modal>
  )
}

function KindGroup({
  kind,
  entries,
  onRemove
}: {
  kind: SyncPackKind
  entries: readonly SyncPackEntry[]
  onRemove: (entry: SyncPackEntry) => void
}) {
  const { t } = useI18n()
  return (
    <div className="grid gap-1.5">
      <h4 className="flex items-center gap-2 text-[13px] font-semibold text-muted">
        <Icon icon={KIND_ICONS[kind]} className="size-[14px] text-subtle" />
        {t(KIND_LABELS[kind])}
        <span className="text-subtle tabular-nums">{entries.length}</span>
      </h4>
      <ul className="grid gap-1.5">
        {entries.map((entry) => (
          <li
            key={entryKey(entry)}
            className="flex min-w-0 items-center gap-3 rounded-lg border border-line bg-surface-input-muted px-2.5 py-1.5"
          >
            <EntryIcon url={entry.iconUrl} kind={entry.kind} />
            <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
            <Badge tone="neutral">{PROVIDER_NAMES[entry.provider]}</Badge>
            <IconButton
              icon="lucide:x"
              label={t('syncpacks.editor.remove', { name: entry.name })}
              onClick={() => onRemove(entry)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

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
