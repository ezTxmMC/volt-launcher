import { useState } from 'react'
import { useI18n } from '@/i18n'
import { useToast } from '@/state/toast'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const confirm = async (): Promise<void> => {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      toast.error(error)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" icon="lucide:trash-2" loading={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-muted">{message}</p>
    </Modal>
  )
}
