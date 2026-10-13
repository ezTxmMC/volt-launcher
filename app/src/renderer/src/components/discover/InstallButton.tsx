import { useI18n } from '@/i18n'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { InstallState } from './useProfileInstall'

/**
 * The install action of a result for a known target profile: "Installieren", a spinner while the job runs,
 * and "Installiert" once the profile has the project. Sits above the result's link overlay.
 */
export function InstallButton({
  state,
  onInstall,
  disabledReason,
  profileName
}: {
  state: InstallState
  onInstall: () => void
  /** Why installing is not possible right now (shown as the tooltip of the disabled button). */
  disabledReason?: string
  profileName?: string
}) {
  const { t } = useI18n()
  if (state === 'installed') {
    return (
      <span className="relative z-10">
        <Badge tone="success" icon="lucide:check">
          {t('discover.installed')}
        </Badge>
      </span>
    )
  }
  return (
    <span className="relative z-10">
      <Button
        size="sm"
        variant="primary"
        icon="lucide:download"
        loading={state === 'installing'}
        disabled={disabledReason !== undefined}
        title={disabledReason ?? (profileName ? t('discover.installInto', { profile: profileName }) : undefined)}
        onClick={onInstall}
      >
        {t('discover.install')}
      </Button>
    </span>
  )
}
