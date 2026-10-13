import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { SyncPack } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobFinished } from '@/state/jobs'
import { ConfirmModal } from '@/components/ConfirmModal'
import { PackAutoSection } from '@/components/packs/PackAutoSection'
import { FromProfileDialog, NewPackDialog, RenameDialog } from '@/components/packs/PackDialogs'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Page, PageHeader } from '@/components/ui/Page'
import { PackDetail } from './PackDetail'

type Dialog = { kind: 'new' } | { kind: 'fromProfile' } | { kind: 'rename'; pack: SyncPack } | { kind: 'delete'; pack: SyncPack } | null

const LAST_PACK_KEY = 'volt.packs.last'

/** The pack shown last (so the page opens straight into it); null when there is none or storage is blocked. */
function lastPack(): string | null {
  try {
    return window.localStorage.getItem(LAST_PACK_KEY)
  } catch {
    return null
  }
}

function rememberPack(id: string): void {
  try {
    window.localStorage.setItem(LAST_PACK_KEY, id)
  } catch {
    // a blocked storage only means the page opens at the first pack next time
  }
}

/**
 * Synced packs: the page opens straight into the selected pack (content, discover, profiles); a row of chips
 * switches packs when there are several. The rules and the global "new version -> new profile" block follow
 * below. The selected pack is kept in `?pack=` and remembered for the next visit.
 */
export function PacksPage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const load = useCallback(() => api.syncpacks.list(), [])
  const { data, error, reload } = useAsync(load)
  const [dialog, setDialog] = useState<Dialog>(null)

  // A finished link or sync changes the linked profiles of the packs.
  useJobFinished((job) => {
    if (job.kind === 'syncpack') reload()
  })

  const packs = useMemo(() => data?.packs ?? [], [data])
  const names = useMemo(() => packs.map((pack) => pack.name), [packs])
  const requested = params.get('pack') ?? lastPack()
  const selected = packs.find((pack) => pack.id === requested) ?? packs[0]

  const select = (id: string): void => {
    rememberPack(id)
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('pack', id)
        return next
      },
      { replace: true }
    )
  }

  const created = (pack: SyncPack): void => {
    setDialog(null)
    select(pack.id)
    reload()
  }
  const close = (): void => setDialog(null)

  const actions = (
    <>
      <Button variant="primary" icon="lucide:plus" onClick={() => setDialog({ kind: 'new' })}>
        {t('syncpacks.new')}
      </Button>
      <Button icon="lucide:copy" onClick={() => setDialog({ kind: 'fromProfile' })}>
        {t('syncpacks.fromProfile')}
      </Button>
    </>
  )

  return (
    <Page>
      <PageHeader title={t('packs.title')} description={t('syncpacks.intro')} actions={actions} />

      {error && <ErrorNotice message={error} onRetry={reload} />}
      {!data && !error && <LoadingBlock />}

      {data && packs.length === 0 && (
        <EmptyState
          icon="lucide:package-plus"
          title={t('syncpacks.empty.title')}
          description={t('syncpacks.empty.hint')}
          action={<div className="flex flex-wrap justify-center gap-2">{actions}</div>}
        />
      )}

      {data && packs.length > 0 && (
        <>
          {packs.length > 1 && (
            <ul aria-label={t('packs.title')} className="flex flex-wrap gap-2">
              {packs.map((pack) => {
                const active = pack.id === selected?.id
                return (
                  <li key={pack.id}>
                    <button
                      type="button"
                      aria-current={active}
                      onClick={() => select(pack.id)}
                      className={`inline-flex max-w-[260px] items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors duration-[var(--motion-base)] ${
                        active
                          ? 'border-[var(--accent-border)] bg-accent-soft text-fg'
                          : 'border-line bg-surface text-muted hover:border-[var(--accent-border)] hover:text-fg'
                      }`}
                    >
                      <span className="truncate" title={pack.name}>
                        {pack.name}
                      </span>
                      <span className="text-[12px] text-subtle tabular-nums">{pack.entries.length}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {selected && (
            <PackDetail
              key={selected.id}
              pack={selected}
              onChanged={reload}
              onRename={() => setDialog({ kind: 'rename', pack: selected })}
              onDelete={() => setDialog({ kind: 'delete', pack: selected })}
            />
          )}

          <div className="grid gap-1.5 text-[13px] leading-[1.6] text-muted">
            <p>{t('syncpacks.rule.latest')}</p>
            <p>{t('syncpacks.rule.profileWins')}</p>
          </div>

          <PackAutoSection packs={packs} />
        </>
      )}

      {dialog?.kind === 'new' && <NewPackDialog existingNames={names} onClose={close} onSaved={created} />}
      {dialog?.kind === 'fromProfile' && <FromProfileDialog existingNames={names} onClose={close} onSaved={created} />}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          pack={dialog.pack}
          existingNames={names}
          onClose={close}
          onSaved={() => {
            setDialog(null)
            reload()
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmModal
          title={t('syncpacks.delete.title')}
          message={t('syncpacks.delete.message', { name: dialog.pack.name })}
          confirmLabel={t('syncpacks.delete.confirm')}
          onConfirm={async () => {
            await api.syncpacks.remove(dialog.pack.id)
            reload()
          }}
          onClose={close}
        />
      )}
    </Page>
  )
}
