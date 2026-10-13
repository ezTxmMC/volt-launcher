import { useCallback, useState } from 'react'
import type { SyncPackEntry, SyncPackKind } from '@shared/models'
import { useI18n } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { entryKey } from './options'
import { nameProblemOf } from './PackDialogs'

const NEW_PACK = '__new__'

/**
 * Adds one project of a profile to a synced pack: an existing pack, or a new one made on the spot.
 * The version is not stored; each profile resolves it when the pack is applied.
 */
export function AddToPackDialog({ entry, onClose }: { entry: SyncPackEntry; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const load = useCallback(() => api.syncpacks.list(), [])
  const { data, error, reload } = useAsync(load)
  const [chosen, setChosen] = useState<string | null>(null)
  const [newName, setNewName] = useState(entry.name)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const packs = data?.packs ?? []
  const target = chosen ?? packs[0]?.id ?? NEW_PACK
  const creating = target === NEW_PACK || packs.length === 0
  const pack = packs.find((candidate) => candidate.id === target)
  const key = entryKey(entry)
  const already = !creating && pack?.entries.some((existing) => entryKey(existing) === key) === true
  const nameProblem = creating ? nameProblemOf(newName, packs.map((candidate) => candidate.name)) : null
  const nameMessage = nameProblem === 'empty' ? t('syncpacks.name.required') : nameProblem === 'taken' ? t('syncpacks.name.taken') : undefined
  const canSave = data !== undefined && !saving && !already && nameProblem === null

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    setFailure(null)
    try {
      if (creating) {
        const created = await api.syncpacks.create(newName.trim(), [entry])
        toast.success(t('syncpacks.addTo.created', { name: entry.name, pack: created.name }))
      } else if (pack) {
        await api.syncpacks.update(pack.id, { entries: [...pack.entries, entry] })
        toast.success(t('syncpacks.addTo.added', { name: entry.name, pack: pack.name }))
      }
      onClose()
    } catch (problem) {
      setFailure(errorMessage(problem))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('syncpacks.addTo.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon="lucide:package-plus" loading={saving} disabled={!canSave} onClick={() => void save()}>
            {t('syncpacks.addTo.confirm')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <p className="text-muted">{t('syncpacks.addTo.description', { name: entry.name })}</p>
        {error && <ErrorNotice message={error} onRetry={reload} />}
        {!data && !error && <LoadingBlock />}
        {data && (
          <>
            <Field label={t('syncpacks.addTo.pack')} hint={already ? t('syncpacks.addTo.already') : t('syncpacks.addTo.hint')}>
              <Select value={creating ? NEW_PACK : target} onChange={(event) => setChosen(event.target.value)}>
                {packs.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
                <option value={NEW_PACK}>{t('syncpacks.addTo.new')}</option>
              </Select>
            </Field>
            {creating && (
              <Field label={t('syncpacks.editor.name')} hint={nameMessage}>
                <TextInput
                  value={newName}
                  maxLength={60}
                  aria-invalid={nameProblem !== null || undefined}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </Field>
            )}
          </>
        )}
        {failure && <ErrorNotice message={failure} />}
      </form>
    </Modal>
  )
}

/** The pack kind a content type maps to; data packs are not part of packs. */
export function packKindOf(type: 'mods' | 'resourcepacks' | 'shaderpacks' | 'datapacks'): SyncPackKind | null {
  if (type === 'mods') return 'mod'
  if (type === 'resourcepacks') return 'resourcepack'
  if (type === 'shaderpacks') return 'shader'
  return null
}
