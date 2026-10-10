import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router'
import type { Account } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { ConfirmModal } from '@/components/ConfirmModal'
import { AccountAvatar } from './Avatar'
import { SignInDialog } from './SignInDialog'
import { notifyChanged, useAccountsView } from './data'

/**
 * Account chip of the top bar: avatar, the selected Microsoft account and a menu to switch accounts,
 * add one, manage them, open skins and sign out. Also keeps the account and skin views up to date
 * when a background job finishes.
 */
export function AccountMenu() {
  const { t } = useI18n()
  const toast = useToast()
  const jobs = useJobs()
  const navigate = useNavigate()
  const { data, error } = useAccountsView()
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'signIn' | 'signOut' | null>(null)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return jobs.onJobFinished((job) => {
      if (job.kind === 'account-login') notifyChanged('accounts')
      if (job.kind === 'skin-apply') {
        notifyChanged('skins')
        notifyChanged('accounts')
        const result = job.result
        const skin = result?.skin
        const name = typeof skin === 'object' && skin !== null && 'name' in skin && typeof skin.name === 'string' ? skin.name : ''
        if (job.state === 'done') toast.success(t('skins.applied', { name }))
        if (job.state === 'failed') toast.error(job.error ?? t('skins.applyFailed'))
      }
    })
  }, [jobs, t, toast])

  // Close on a click outside the menu or on Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Only Microsoft accounts are offered; the launcher has no offline accounts.
  const accounts: Account[] = (data?.accounts ?? []).filter((account) => account.type === 'microsoft')
  const selected = accounts.find((account) => account.selected)
  const label = selected?.name ?? t('accounts.menu.noAccount')

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await action()
      notifyChanged('accounts')
    } catch (failure) {
      toast.error(failure)
    } finally {
      setBusy(false)
    }
  }

  const choose = (account: Account): void => {
    if (account.selected) return
    void run(async () => {
      await api.accounts.select(account.id)
      toast.info(t('accounts.selected', { name: account.name }))
    })
  }

  const menuItem = 'flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[14px] transition-colors duration-150 hover:bg-white/5'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('accounts.menu.label')}
        className="flex h-8 max-w-[210px] shrink items-center gap-2 rounded-full border border-line bg-surface-3 pr-2.5 pl-1 text-[13px] text-muted transition-all duration-200 hover:bg-line hover:text-fg"
      >
        <AccountAvatar name={label} skinDataUrl={selected?.skinDataUrl} className="size-6 rounded-full text-[11px]" />
        <span className="hidden min-w-0 truncate font-semibold md:inline">{error ? t('accounts.loadFailed') : label}</span>
        <Icon icon="lucide:chevron-down" className="size-3.5 shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('accounts.menu.label')}
          className="app-no-drag absolute right-0 top-full z-[70] mt-2 grid w-[300px] max-w-[calc(100vw-2rem)] gap-1 rounded-xl border border-[var(--accent-border)] bg-surface-strong p-2 shadow-pop backdrop-blur-xl"
        >
          <div className="flex items-center gap-3 px-2 py-2">
            <AccountAvatar name={label} skinDataUrl={selected?.skinDataUrl} className="size-9 text-[14px]" />
            <div className="grid min-w-0">
              <span className="text-[11px] font-bold tracking-[0.14em] text-subtle uppercase">{t('accounts.menu.label')}</span>
              <span className="truncate text-[14px] font-semibold">{label}</span>
            </div>
          </div>

          {accounts.length > 0 && <div className="my-1 h-px bg-line" />}
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              role="menuitemradio"
              aria-checked={account.selected}
              onClick={() => choose(account)}
              disabled={busy}
              title={account.skinError ? t('accounts.avatar.skinError', { error: account.skinError }) : undefined}
              className={`${menuItem} disabled:opacity-60 ${account.selected ? 'bg-accent-soft' : ''}`}
            >
              <AccountAvatar name={account.name} skinDataUrl={account.skinDataUrl} className="size-7 text-[12px]" />
              <span className="min-w-0 flex-1 truncate font-semibold">{account.name}</span>
              {account.selected && <Icon icon="lucide:check" className="size-4 text-accent" />}
            </button>
          ))}

          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setDialog('signIn')
            }}
            className={menuItem}
          >
            <Icon icon="lucide:log-in" className="size-4 text-accent" />
            {t('accounts.menu.signIn')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void navigate('/accounts')
            }}
            className={menuItem}
          >
            <Icon icon="lucide:users" className="size-4 text-muted" />
            {t('accounts.menu.manage')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void navigate('/skins')
            }}
            className={menuItem}
          >
            <Icon icon="lucide:shirt" className="size-4 text-muted" />
            {t('accounts.menu.skins')}
          </button>

          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setDialog('signOut')
            }}
            className={`${menuItem} text-danger-text`}
          >
            <Icon icon="lucide:log-out" className="size-4" />
            {t('accounts.menu.signOut')}
          </button>
        </div>
      )}

      {dialog === 'signIn' && <SignInDialog onClose={() => setDialog(null)} />}
      {dialog === 'signOut' && (
        <ConfirmModal
          title={t('accounts.signOutTitle')}
          message={t('accounts.signOutMessage')}
          confirmLabel={t('accounts.signOutConfirm')}
          onConfirm={async () => {
            await api.accounts.logout()
            toast.success(t('accounts.signedOut'))
            // The auth state reloads and sends the user to the login page.
            notifyChanged('accounts')
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
