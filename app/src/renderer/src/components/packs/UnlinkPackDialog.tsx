import { useState } from 'react'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

/** Asks what happens to the pack's files: keep them as ordinary content, or remove them from the profile. */
export function UnlinkPackDialog({
  profileId,
  packId,
  packName,
  profileName,
  onClose,
  onDone
}: {
  profileId: string
  packId: string
  packName: string
  /** Shown in the message when the dialog is not opened from the profile itself. */
  profileName?: string
  onClose: () => void
  onDone: (removed: number, kept: number) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const unlink = async (removeFiles: boolean): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.profiles.syncPacks.unlink(profileId, packId, removeFiles)
      onDone(result.removed.length, result.kept.length)
    } catch (error) {
      toast.error(error)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('profile.syncpacks.removeTitle', { name: packName })}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="secondary" icon="lucide:link" loading={busy} onClick={() => void unlink(false)}>
            {t('profile.syncpacks.keep')}
          </Button>
          <Button variant="danger" icon="lucide:trash-2" disabled={busy} onClick={() => void unlink(true)}>
            {t('profile.syncpacks.removeFiles')}
          </Button>
        </>
      }
    >
      <p className="text-muted">
        {profileName ? t('syncpacks.unlink.messageProfile', { profile: profileName }) : t('profile.syncpacks.removeMessage')}
      </p>
    </Modal>
  )
}
