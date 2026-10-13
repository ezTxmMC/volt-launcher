import { useCallback, useState } from 'react'
import type { SyncPack } from '@shared/models'
import { useI18n } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Feedback'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'

/** Shared name check: empty and taken names block the save; the backend answers the same rules with 400/409. */
export function nameProblemOf(name: string, existingNames: readonly string[], current?: string): 'empty' | 'taken' | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'empty'
  if (existingNames.some((existing) => existing.toLowerCase() === trimmed.toLowerCase() && existing !== current)) return 'taken'
  return null
}

/** Creates an empty pack with a name; its entries are added afterwards on the pack page. */
export function NewPackDialog({
  existingNames,
  onClose,
  onSaved
}: {
  existingNames: readonly string[]
  onClose: () => void
  onSaved: (pack: SyncPack) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problem = nameProblemOf(name, existingNames)
  const message = problem === 'taken' ? t('syncpacks.name.taken') : t('syncpacks.editor.nameHint')
  const canSave = !saving && problem === null

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const created = await api.syncpacks.create(name.trim())
      toast.success(t('settings.saved'))
      onSaved(created)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('syncpacks.editor.new')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon="lucide:plus" loading={saving} disabled={!canSave} onClick={() => void save()}>
            {t('syncpacks.new.create')}
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
        <Field label={t('syncpacks.editor.name')} hint={message}>
          <TextInput
            value={name}
            maxLength={60}
            placeholder={t('syncpacks.editor.namePlaceholder')}
            aria-invalid={problem === 'taken' || undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {error && <ErrorNotice message={error} />}
      </form>
    </Modal>
  )
}

/** Renames a pack (PATCH with the name). */
export function RenameDialog({
  pack,
  existingNames,
  onClose,
  onSaved
}: {
  pack: SyncPack
  existingNames: readonly string[]
  onClose: () => void
  onSaved: (pack: SyncPack) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [name, setName] = useState(pack.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problem = nameProblemOf(name, existingNames, pack.name)
  const message = problem === 'empty' ? t('syncpacks.name.required') : problem === 'taken' ? t('syncpacks.name.taken') : null
  const canSave = !saving && problem === null && name.trim() !== pack.name

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const saved = await api.syncpacks.update(pack.id, { name: name.trim() })
      toast.success(t('settings.saved'))
      onSaved(saved)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('syncpacks.rename.title')}
      onClose={onClose}
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
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Field label={t('syncpacks.editor.name')} hint={message ?? undefined}>
          <TextInput value={name} maxLength={60} aria-invalid={message !== null || undefined} onChange={(event) => setName(event.target.value)} />
        </Field>
        {error && <ErrorNotice message={error} />}
      </form>
    </Modal>
  )
}

/** Creates a pack from the mods of an existing profile (POST /api/syncpacks/from-profile). */
export function FromProfileDialog({
  existingNames,
  onClose,
  onSaved
}: {
  existingNames: readonly string[]
  onClose: () => void
  onSaved: (pack: SyncPack) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const loadProfiles = useCallback(() => api.profiles.list(), [])
  const profiles = useAsync(loadProfiles)
  const [chosen, setChosen] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const list = profiles.data ?? []
  const profileId = chosen ?? list[0]?.id ?? ''
  const profileName = list.find((profile) => profile.id === profileId)?.name ?? ''
  // The pack takes the profile's name until the user types their own.
  const shownName = name ?? profileName
  const problem = nameProblemOf(shownName, existingNames)
  const message = problem === 'empty' ? t('syncpacks.name.required') : problem === 'taken' ? t('syncpacks.name.taken') : t('syncpacks.fromProfile.hint')
  const canSave = !saving && profileId !== '' && problem === null

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const created = await api.syncpacks.fromProfile(profileId, shownName.trim())
      toast.success(t('settings.saved'))
      onSaved(created)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={t('syncpacks.fromProfile.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon="lucide:copy" loading={saving} disabled={!canSave} onClick={() => void save()}>
            {t('syncpacks.fromProfile.create')}
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
        <Field label={t('syncpacks.fromProfile.profile')}>
          <Select
            value={profileId}
            onChange={(event) => {
              setChosen(event.target.value)
              setName(null)
            }}
            disabled={list.length === 0}
          >
            {list.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('syncpacks.editor.name')} hint={message}>
          <TextInput value={shownName} maxLength={60} aria-invalid={problem !== null || undefined} onChange={(event) => setName(event.target.value)} />
        </Field>
        {profiles.error && <ErrorNotice message={profiles.error} onRetry={profiles.reload} />}
        {error && <ErrorNotice message={error} />}
      </form>
    </Modal>
  )
}
