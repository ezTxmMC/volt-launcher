import { Icon } from '@iconify/react'
import { Navigate } from 'react-router'
import logo from '@/assets/voltlauncher.png'
import { AuroraBackground } from '@/components/AuroraBackground'
import { Wordmark } from '@/components/Wordmark'
import { WindowControls } from '@/components/WindowControls'
import { useMicrosoftSignIn } from '@/components/accounts/SignInDialog'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, ProgressBar } from '@/components/ui/Feedback'
import { useI18n } from '@/i18n'
import { useAuth } from '@/state/auth'

/**
 * Full-screen sign-in page, outside the shell. The launcher needs a Microsoft account; there is no
 * offline option. Once an account is signed in, the page leads to the start page.
 */
export function LoginPage() {
  const { t } = useI18n()
  const { signedIn } = useAuth()
  const signIn = useMicrosoftSignIn()

  if (signedIn) return <Navigate to="/" replace />

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg text-fg antialiased">
      <AuroraBackground />
      <header className="app-drag relative z-10 flex h-[52px] shrink-0 items-center justify-between gap-3 pr-2 pl-4">
        <Wordmark />
        <WindowControls />
      </header>

      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto p-4 sm:p-6">
        <section className="grid w-full min-w-0 max-w-[440px] grid-cols-1 gap-6 rounded-2xl border border-line bg-surface p-6 shadow-pop sm:p-7">
          <div className="flex items-center gap-4">
            <img src={logo} alt="" className="size-14 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-[0.14em] text-subtle uppercase">Volt Launcher</p>
              <h1 className="text-xl font-bold">{t('login.heading')}</h1>
            </div>
          </div>

          <p className="text-muted">{t('login.lead')}</p>

          {signIn.error && <ErrorNotice message={signIn.error} />}

          {signIn.running ? (
            <div className="grid grid-cols-1 gap-3" role="status">
              <p className="text-muted">{t('accounts.signIn.running')}</p>
              <ProgressBar value={signIn.progress} label={t('accounts.signIn.running')} />
              {signIn.message && <p className="text-[13px] text-subtle">{signIn.message}</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              <Button
                variant="launch"
                icon="lucide:log-in"
                loading={signIn.busy}
                onClick={() => void signIn.start()}
                className="h-11 w-full text-[15px]"
              >
                {t('accounts.signIn')}
              </Button>
              <p className="text-[13px] text-subtle">{t('accounts.signIn.step1')}</p>
            </div>
          )}

          <p className="flex items-start gap-2 text-[12px] text-subtle">
            <Icon icon="lucide:shield-check" className="mt-px size-4 shrink-0" />
            {t('accounts.signIn.privacy')}
          </p>
        </section>
      </main>
    </div>
  )
}
