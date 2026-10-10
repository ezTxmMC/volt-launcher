import { useState } from 'react'
import type { Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { Button } from './ui/Button'
import { Field, Select } from './ui/Field'
import { Modal } from './ui/Modal'

/** Lets the user choose the profile a project version is installed into. */
export function InstallTargetModal({
  profiles,
  initialProfileId,
  versionLabel,
  onConfirm,
  onClose
}: {
  profiles: readonly Profile[]
  initialProfileId: string
  versionLabel: string
  onConfirm: (profile: Profile) => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const [profileId, setProfileId] = useState(initialProfileId || profiles[0]?.id || '')
  const [busy, setBusy] = useState(false)
  const profile = profiles.find((candidate) => candidate.id === profileId)

  const confirm = async (): Promise<void> => {
    if (!profile) return
    setBusy(true)
    try {
      await onConfirm(profile)
      onClose()
    } catch {
      // The caller reports the error; keep the dialog open so the user can retry.
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('install.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon="lucide:download" disabled={!profile} loading={busy} onClick={() => void confirm()}>
            {t('install.confirm')}
          </Button>
        </>
      }
    >
      {profiles.length === 0 ? (
        <p className="text-muted">{t('install.noProfiles')}</p>
      ) : (
        <div className="grid gap-4">
          <p className="text-muted">{t('install.description', { version: versionLabel })}</p>
          <Field label={t('install.profile')}>
            <Select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
              {profiles.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.minecraftVersion}, {candidate.loader})
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  )
}
