import { useCallback, useMemo, useState } from 'react'
import type { SyncPack } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorNotice } from '@/components/ui/Feedback'
import { ConfirmModal } from '@/components/ConfirmModal'
import { SettingsCard } from '@/components/settings/SettingsParts'
import { SyncPackCard } from './SyncPackCard'
import { SyncPackEditor } from './SyncPackEditor'
import { FromProfileDialog, RenameDialog } from './SyncPackDialogs'
import { SyncPackAutoConfigCard } from './SyncPackAutoConfigCard'
import { SyncPackAutoStatusCard } from './SyncPackAutoStatusCard'

type Dialog =
  | { kind: 'new' }
  | { kind: 'edit'; pack: SyncPack }
  | { kind: 'rename'; pack: SyncPack }
  | { kind: 'delete'; pack: SyncPack }
  | { kind: 'fromProfile' }
  | null

/** The synced packs: the pack cards with their dialogs, then the automatic creation of profiles. */
export function SyncPacksSection() {
  const { t } = useI18n()
  const toast = useToast()
  const { jobs, track } = useJobs()
  const load = useCallback(() => api.syncpacks.list(), [])
  const { data, error, reload } = useAsync(load)
  const [dialog, setDialog] = useState<Dialog>(null)

  const packs = useMemo(() => data?.packs ?? [], [data])
  const names = useMemo(() => packs.map((pack) => pack.name), [packs])
  const syncBusy = jobs.some((job) => job.kind === 'syncpack' && job.state === 'running')

  // A finished sync or link changes the linked profiles of the packs.
  useJobFinished((job) => {
    if (job.kind === 'syncpack') reload()
  })

  const sync = async (pack: SyncPack): Promise<void> => {
    try {
      track(await api.syncpacks.sync(pack.id))
    } catch (error) {
      toast.error(error)
    }
  }

  const close = (): void => setDialog(null)
  const done = (): void => {
    setDialog(null)
    reload()
  }

  return (
    <div className="grid gap-5">
      <SettingsCard title={t('syncpacks.section')} icon="lucide:layers" hint={t('syncpacks.intro')}>
        <div className="grid gap-1.5 text-[13px] leading-[1.6] text-muted">
          <p>{t('syncpacks.rule.latest')}</p>
          <p>{t('syncpacks.rule.profileWins')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon="lucide:plus" onClick={() => setDialog({ kind: 'new' })}>
            {t('syncpacks.new')}
          </Button>
          <Button icon="lucide:copy" onClick={() => setDialog({ kind: 'fromProfile' })}>
            {t('syncpacks.fromProfile')}
          </Button>
        </div>

        {error && <ErrorNotice message={error} onRetry={reload} />}

        {data && packs.length === 0 ? (
          <EmptyState icon="lucide:layers" title={t('syncpacks.empty.title')} description={t('syncpacks.empty.hint')} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {packs.map((pack) => (
              <li key={pack.id} className="min-w-0">
                <SyncPackCard
                  pack={pack}
                  syncBusy={syncBusy}
                  onEdit={() => setDialog({ kind: 'edit', pack })}
                  onRename={() => setDialog({ kind: 'rename', pack })}
                  onDelete={() => setDialog({ kind: 'delete', pack })}
                  onSync={() => void sync(pack)}
                />
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>

      <SyncPackAutoConfigCard packs={packs} />
      <SyncPackAutoStatusCard />

      {dialog?.kind === 'new' && <SyncPackEditor existingNames={names} onClose={close} onSaved={done} />}
      {dialog?.kind === 'edit' && (
        <SyncPackEditor pack={dialog.pack} existingNames={names} onClose={close} onSaved={done} />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog pack={dialog.pack} existingNames={names} onClose={close} onSaved={done} />
      )}
      {dialog?.kind === 'fromProfile' && <FromProfileDialog existingNames={names} onClose={close} onSaved={done} />}
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
    </div>
  )
}
