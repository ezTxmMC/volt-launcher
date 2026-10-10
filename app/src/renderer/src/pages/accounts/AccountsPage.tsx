import { useState } from 'react'
import type { Account } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useToast } from '@/state/toast'
import { AccountAvatar } from '@/components/accounts/Avatar'
import { SignInDialog } from '@/components/accounts/SignInDialog'
import { notifyChanged, useAccountsView } from '@/components/accounts/data'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Card, Page, PageHeader } from '@/components/ui/Page'
import { ConfirmModal } from '@/components/ConfirmModal'

/** Accounts: the Microsoft accounts with select and remove, and sign-in and sign-out. */
export function AccountsPage() {
  const { t } = useI18n()
  const toast = useToast()
  const { data, error, reload } = useAccountsView()
  const [signingIn, setSigningIn] = useState(false)
  const [removing, setRemoving] = useState<Account | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [busy, setBusy] = useState(false)

  const accounts = (data?.accounts ?? []).filter((account) => account.type === 'microsoft')

  const run = async (action: () => Promise<unknown>, success?: string): Promise<void> => {
    setBusy(true)
    try {
      await action()
      if (success) toast.success(success)
      notifyChanged('accounts')
    } catch (failure) {
      toast.error(failure)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <PageHeader
        title={t('accounts.title')}
        description={t('accounts.subtitle')}
        actions={
          <Button variant="launch" icon="lucide:log-in" onClick={() => setSigningIn(true)}>
            {t('accounts.signIn')}
          </Button>
        }
      />

      {error && <ErrorNotice message={error} onRetry={reload} />}
      {!data && !error && <LoadingBlock />}

      {data && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[13px] font-bold tracking-[0.12em] text-muted uppercase">{t('accounts.list.title')}</h3>
            {accounts.length > 0 && (
              <Button variant="ghost" size="sm" icon="lucide:log-out" onClick={() => setSigningOut(true)}>
                {t('accounts.signOut')}
              </Button>
            )}
          </div>
          <ul className="grid gap-2" aria-label={t('accounts.list.title')}>
            {accounts.map((account) => (
              <li
                key={account.id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  account.selected ? 'border-[var(--accent-border-active)] bg-accent-soft' : 'border-line bg-white/[0.02]'
                }`}
              >
                <AccountAvatar name={account.name} skinDataUrl={account.skinDataUrl} className="size-9 text-[14px]" />
                <div className="grid min-w-0 flex-1 gap-1">
                  <span className="truncate text-[15px] font-semibold">{account.name}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="info">{t('accounts.type.microsoft')}</Badge>
                    {account.selected && (
                      <Badge tone="accent" icon="lucide:check">
                        {t('accounts.active')}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!account.selected && (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      onClick={() => void run(() => api.accounts.select(account.id), t('accounts.selected', { name: account.name }))}
                    >
                      {t('accounts.select')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon="lucide:trash-2" disabled={busy} onClick={() => setRemoving(account)}>
                    {t('accounts.remove')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}
      {removing && (
        <ConfirmModal
          title={t('accounts.removeTitle')}
          message={t('accounts.removeMessage', { name: removing.name })}
          confirmLabel={t('accounts.removeConfirm')}
          onConfirm={async () => {
            await api.accounts.remove(removing.id)
            toast.success(t('accounts.removed', { name: removing.name }))
            notifyChanged('accounts')
          }}
          onClose={() => setRemoving(null)}
        />
      )}
      {signingOut && (
        <ConfirmModal
          title={t('accounts.signOutTitle')}
          message={t('accounts.signOutMessage')}
          confirmLabel={t('accounts.signOutConfirm')}
          onConfirm={async () => {
            await api.accounts.logout()
            toast.success(t('accounts.signedOut'))
            notifyChanged('accounts')
          }}
          onClose={() => setSigningOut(false)}
        />
      )}
    </Page>
  )
}
