import { type FormEvent, useEffect, useState } from 'react'
import type { ProfileListItem } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'

export interface FormField {
  key: string
  label: string
  value: string
  hint?: string
  placeholder?: string
  /** A required field must not be empty when submitted. */
  required?: boolean
}

/**
 * A modal with text fields and a submit button. `onSubmit` receives the values; it rejects
 * with an error (shown as a toast) to keep the dialog open.
 */
export function FormModal({
  title,
  fields,
  submitLabel,
  onSubmit,
  onClose
}: {
  title: string
  fields: readonly FormField[]
  submitLabel: string
  onSubmit: (values: Record<string, string>) => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.value]))
  )
  const [busy, setBusy] = useState(false)

  const missing = fields.some((field) => field.required && (values[field.key] ?? '').trim() === '')

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (missing || busy) return
    setBusy(true)
    try {
      await onSubmit(values)
      onClose()
    } catch (error) {
      toast.error(error)
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        {fields.map((field) => (
          <Field key={field.key} label={field.label} hint={field.hint}>
            <TextInput
              value={values[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          </Field>
        ))}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={missing}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Picks the profile a world is copied into; every profile except `excludeId` is offered. */
export function CopyWorldModal({
  worldName,
  excludeId,
  onSubmit,
  onClose
}: {
  worldName: string
  excludeId: string
  onSubmit: (targetProfileId: string) => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [profiles, setProfiles] = useState<ProfileListItem[] | null>(null)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.profiles.list().then(
      (list) => {
        if (!cancelled) setProfiles(list.filter((profile) => profile.id !== excludeId))
      },
      (error: unknown) => toast.error(error)
    )
    return () => {
      cancelled = true
    }
  }, [excludeId, toast])

  const options = profiles ?? []
  const selected = target || options[0]?.id || ''

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!selected || busy) return
    setBusy(true)
    try {
      await onSubmit(selected)
      onClose()
    } catch (error) {
      toast.error(error)
      setBusy(false)
    }
  }

  return (
    <Modal title={t('saves.worlds.copyTitle')} onClose={onClose}>
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        <p className="text-muted">{worldName}</p>
        {profiles && options.length === 0 ? (
          <p className="text-subtle">{t('saves.worlds.noTarget')}</p>
        ) : (
          <Field label={t('saves.worlds.copyTarget')} hint={t('saves.worlds.copyHint')}>
            <Select value={selected} onChange={(event) => setTarget(event.target.value)} disabled={!profiles}>
              {options.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} · {profile.minecraftVersion}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!selected}>
            {t('saves.worlds.copy')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
