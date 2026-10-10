import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import type { Job } from '@shared/models'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/lib/api'
import { useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, ProgressBar } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { notifyChanged } from './data'

/** Opens the sign-in window (main process); resolves to the account-login job, or null when it was closed. */
function openSignInWindow(): Promise<Job | null> {
  if (!window.volt) return Promise.reject(new Error('The Electron bridge (window.volt) is not available.'))
  return window.volt.signIn()
}

/**
 * Microsoft sign-in flow shared by the sign-in dialog and the login page. The main process opens the
 * login page in its own window and catches the redirect, so the user has nothing to copy. The backend
 * exchanges the code as a job; this hook tracks that job and reports its end.
 */
export function useMicrosoftSignIn(onDone?: () => void) {
  const { t } = useI18n()
  const toast = useToast()
  const jobs = useJobs()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const job: Job | undefined = jobId ? jobs.jobs.find((candidate) => candidate.id === jobId) : undefined

  // The job reports its own end; the account views and the auth state update through notifyChanged.
  useEffect(() => {
    if (!jobId) return
    return jobs.onJobFinished((finished) => {
      if (finished.id !== jobId) return
      if (finished.state === 'done') {
        const result = finished.result
        const name = typeof result?.name === 'string' ? result.name : ''
        toast.success(t('accounts.signIn.done', { name }))
        notifyChanged('accounts')
        onDone?.()
      } else {
        setError(finished.error ?? t('accounts.signIn.failed'))
        setJobId(null)
      }
    })
  }, [jobId, jobs, onDone, t, toast])

  const start = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const started = await openSignInWindow()
      // Closed without signing in: back to the start state, nothing to report.
      if (started === null) return
      // Registering the job makes the jobs provider poll it and report when it ends.
      jobs.track(started)
      setJobId(started.id)
      notifyChanged('accounts')
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }, [jobs])

  return {
    start,
    busy,
    error,
    running: jobId !== null,
    progress: job && job.state === 'running' ? job.progress : null,
    message: job?.message ?? null
  }
}

/** Microsoft sign-in dialog, opened from the account menu and the accounts page. */
export function SignInDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const { start, busy, error, running, progress, message } = useMicrosoftSignIn(onClose)

  return (
    <Modal
      title={t('accounts.signIn.title')}
      onClose={onClose}
      wide
      footer={
        running ? null : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="launch" icon="lucide:log-in" loading={busy} disabled={busy} onClick={() => void start()}>
              {error ? t('common.retry') : t('accounts.signIn.start')}
            </Button>
          </>
        )
      }
    >
      <div className="grid gap-4">
        {error && <ErrorNotice message={error} />}
        {running ? (
          <div className="grid gap-3" role="status">
            <p className="text-muted">{t('accounts.signIn.running')}</p>
            <ProgressBar value={progress} label={t('accounts.signIn.running')} />
            {message && <p className="text-[13px] text-subtle">{message}</p>}
          </div>
        ) : (
          <>
            <p className="text-muted">{busy ? t('accounts.signIn.running') : t('accounts.signIn.step1')}</p>
            <p className="flex items-center gap-2 text-[12px] text-subtle">
              <Icon icon="lucide:shield-check" className="size-4 shrink-0" />
              {t('accounts.signIn.privacy')}
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
