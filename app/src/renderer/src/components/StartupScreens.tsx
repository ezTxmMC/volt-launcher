import { Icon } from '@iconify/react'
import type { BackendStatus } from '@shared/bridge'
import { useI18n } from '@/i18n'
import { Button } from './ui/Button'

export function StartingScreen() {
  const { t } = useI18n()
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="flex flex-col items-center gap-5 text-center" role="status">
        <span className="grid size-16 animate-pulse place-items-center rounded-xl bg-accent text-accent-fg">
          <Icon icon="lucide:zap" className="size-9" />
        </span>
        <div>
          <h1 className="text-xl font-bold">Volt Launcher</h1>
          <p className="mt-1 text-muted">{t('backend.starting.message')}</p>
        </div>
      </div>
    </div>
  )
}

export function BackendErrorScreen({ status }: { status: BackendStatus }) {
  const { t } = useI18n()
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-6">
      <div className="grid w-full max-w-2xl gap-5" role="alert">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
            <Icon icon="lucide:server-crash" className="size-8" />
          </span>
          <div>
            <h1 className="text-xl font-bold">{t('backend.failed.title')}</h1>
            <p className="text-muted">{t('backend.failed.description')}</p>
          </div>
        </div>
        {status.message && <p className="rounded-xl bg-danger-soft px-4 py-3 whitespace-pre-wrap text-danger">{status.message}</p>}
        {status.log && (
          <div className="grid gap-2">
            <h2 className="text-[13px] font-medium text-muted">{t('backend.failed.log')}</h2>
            <pre className="max-h-64 overflow-auto rounded-xl border border-line bg-surface-2 p-4 text-xs whitespace-pre-wrap">
              {status.log}
            </pre>
          </div>
        )}
        {window.volt && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="lucide:refresh-cw" onClick={() => void window.volt?.restartBackend()}>
              {t('common.retry')}
            </Button>
            <Button icon="lucide:log-out" onClick={() => void window.volt?.close()}>
              {t('common.exit')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Shown when the account state could not be read; the retry reloads it. */
export function AccountLoadErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-6">
      <div className="grid w-full max-w-xl gap-5">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
            <Icon icon="lucide:user-round-x" className="size-8" />
          </span>
          <div>
            <h1 className="text-xl font-bold">{t('accounts.loadFailed')}</h1>
            <p className="text-muted">{t('login.loadFailed')}</p>
          </div>
        </div>
        <p className="rounded-xl bg-danger-soft px-4 py-3 whitespace-pre-wrap text-danger">{message}</p>
        <div>
          <Button variant="primary" icon="lucide:refresh-cw" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    </div>
  )
}
