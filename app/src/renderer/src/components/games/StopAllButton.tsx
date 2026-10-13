import { useState } from 'react'
import { useI18n } from '@/i18n'
import { useGames } from '@/state/games'
import { useToast } from '@/state/toast'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Button } from '@/components/ui/Button'

/** "Alle beenden": stops every running game; asks first when more than one runs. */
export function StopAllButton({
  size = 'sm',
  onDialogChange
}: {
  size?: 'sm' | 'md'
  /** Reports whether the confirmation is open (the top-bar panel must not close under it). */
  onDialogChange?: (open: boolean) => void
}) {
  const { t } = useI18n()
  const { entries, stopAll } = useGames()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const running = entries.filter((entry) => entry.state !== 'launching').length
  if (running === 0) return null

  const setDialog = (open: boolean): void => {
    setConfirming(open)
    onDialogChange?.(open)
  }

  return (
    <>
      <Button
        size={size}
        variant="danger"
        icon="lucide:power"
        onClick={() => {
          if (running > 1) setDialog(true)
          else void stopAll().catch((error: unknown) => toast.error(error))
        }}
      >
        {t('games.stopAll')}
      </Button>
      {confirming && (
        <ConfirmModal
          title={t('games.stopAll.title')}
          message={t('games.stopAll.message', { count: running })}
          confirmLabel={t('games.stopAll')}
          onClose={() => setDialog(false)}
          onConfirm={stopAll}
        />
      )}
    </>
  )
}
