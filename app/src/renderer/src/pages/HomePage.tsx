import { type ReactNode, useCallback, useState } from 'react'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobFinished } from '@/state/jobs'
import { CreateProfileModal } from '@/components/CreateProfileModal'
import { useAccountsView } from '@/components/accounts/data'
import { PlayStage } from '@/components/home/PlayStage'
import { useSelectedProfile } from '@/components/home/hooks/useSelectedProfile'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Card } from '@/components/ui/Page'

/**
 * Home: the selected account with its skin, the launch dock of the selected profile and the
 * quick-play strip of its servers. Without a signed-in account the page shows nothing; the auth
 * gate sends the user to the sign-in page.
 */
export function HomePage() {
  const { t } = useI18n()
  const load = useCallback(() => api.profiles.list(), [])
  const { data: profiles, error, reload } = useAsync(load)
  const accounts = useAccountsView()
  const [selected, choose] = useSelectedProfile(profiles)
  const [creating, setCreating] = useState(false)

  // A finished launch sets lastPlayed on the backend; reload so the choice of the most recent profile is current.
  useJobFinished((job) => {
    if (job.kind === 'launch') reload()
  })

  if (!accounts.data) {
    return accounts.error ? <ErrorNotice message={accounts.error} onRetry={accounts.reload} /> : <LoadingBlock />
  }
  const account = accounts.data.accounts.find((entry) => entry.selected)
  if (!account) return null

  if (!profiles) {
    return error ? <ErrorNotice message={error} onRetry={reload} /> : <LoadingBlock />
  }

  if (!selected) {
    return (
      <Frame>
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="font-semibold">{t('home.firstProfile.title')}</h4>
            <p className="text-muted">{t('home.firstProfile.description')}</p>
          </div>
          <Button variant="primary" icon="lucide:plus" onClick={() => setCreating(true)}>
            {t('profiles.new')}
          </Button>
        </Card>
        {creating && <CreateProfileModal onClose={() => setCreating(false)} />}
      </Frame>
    )
  }

  return (
    <Frame>
      {error && <ErrorNotice message={error} onRetry={reload} />}
      <PlayStage
        key={selected.id}
        profiles={profiles}
        profile={selected}
        accountName={account.name}
        onSelect={choose}
      />
    </Frame>
  )
}

/** Fills the main area of the shell; the stage takes the free height. */
function Frame({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col gap-3 p-3 md:p-4">{children}</div>
}
