import { useCallback, useState } from 'react'
import { Icon } from '@iconify/react'
import type { Job, Profile, ServerInfo } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { JobRow } from '@/components/JobRow'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Stagger } from '@/components/motion/Stagger'
import { useLaunchBlock } from '@/state/games'
import { launchFailureText, useGameBusy, useLaunchProfile } from '@/components/home/hooks/useLaunchProfile'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { FormModal } from './dialogs'

type ServerDialog = { kind: 'add' } | { kind: 'edit'; server: ServerInfo } | { kind: 'remove'; server: ServerInfo }

export function ServersPanel({ profile }: { profile: Profile }) {
  const { t } = useI18n()
  const toast = useToast()
  const { jobs } = useJobs()
  const launchGame = useLaunchProfile()
  const { busy: gameBusy, reload: reloadGame } = useGameBusy(profile.id)
  const load = useCallback(() => api.saves.servers(profile.id).then((result) => result.servers), [profile.id])
  const { data: servers, error, loading, reload } = useAsync(load)
  const [dialog, setDialog] = useState<ServerDialog | null>(null)
  const close = (): void => setDialog(null)
  // Index of the server whose join request is in flight, and the launch jobs this panel started.
  const [joining, setJoining] = useState<number | null>(null)
  const [jobIds, setJobIds] = useState<readonly string[]>([])

  // A finished launch: report its failure and refresh the game status.
  useJobFinished((job: Job) => {
    if (!jobIds.includes(job.id)) return
    if (job.state === 'failed') toast.error(job.error ?? job.title)
    reloadGame()
  })

  const ownJobs = jobs.filter((job) => jobIds.includes(job.id) && job.state === 'running')
  const launchBlock = useLaunchBlock(profile.id)
  const joinDisabled = gameBusy || launchBlock.blocked || ownJobs.length > 0 || joining !== null

  const join = async (server: ServerInfo): Promise<void> => {
    setJoining(server.index)
    try {
      const job = await launchGame(profile.id, { mode: 'multiplayer', server: server.address })
      setJobIds((current) => [...current, job.id])
      reloadGame()
    } catch (error) {
      toast.notify('error', launchFailureText(error, t('quickPlay.gameRunning')))
    } finally {
      setJoining(null)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button icon="lucide:refresh-cw" onClick={reload}>
          {t('saves.refresh')}
        </Button>
        <Button variant="primary" icon="lucide:plus" onClick={() => setDialog({ kind: 'add' })}>
          {t('saves.servers.add')}
        </Button>
      </div>

      {ownJobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}

      {error && <ErrorNotice message={error} onRetry={reload} />}
      {!servers && loading && <LoadingBlock />}

      {servers && servers.length === 0 && (
        <EmptyState icon="lucide:globe" title={t('saves.servers.empty.title')} description={t('saves.servers.empty.description')} />
      )}

      {servers && servers.length > 0 && (
        <Stagger as="ul" className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {servers.map((server) => (
            <li key={server.index} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3">
              {server.icon ? (
                <img src={server.icon} alt="" className="size-10 rounded-md border border-line object-cover [image-rendering:pixelated]" />
              ) : (
                <div className="grid size-10 place-items-center rounded-md border border-line bg-surface-3 text-subtle">
                  <Icon icon="lucide:globe" className="size-4" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium" title={server.name}>
                  {server.name}
                </p>
                <p className="truncate text-xs text-subtle" title={server.address}>
                  {server.address}
                </p>
                {server.acceptTextures && (
                  <div className="mt-1.5">
                    <Badge tone="info" icon="lucide:image">
                      {t('saves.servers.textures')}
                    </Badge>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="primary"
                  size="sm"
                  icon="lucide:play"
                  title={launchBlock.reason ?? t('quickPlay.joinTitle', { address: server.address })}
                  disabled={joinDisabled}
                  loading={joining === server.index}
                  onClick={() => void join(server)}
                >
                  {t('quickPlay.join')}
                </Button>
                <IconButton icon="lucide:pencil" label={t('saves.servers.edit')} onClick={() => setDialog({ kind: 'edit', server })} />
                <IconButton
                  icon="lucide:trash-2"
                  label={t('saves.servers.remove')}
                  className="hover:text-danger"
                  onClick={() => setDialog({ kind: 'remove', server })}
                />
              </div>
            </li>
          ))}
        </Stagger>
      )}

      {dialog?.kind === 'add' && (
        <FormModal
          title={t('saves.servers.addTitle')}
          submitLabel={t('saves.servers.add')}
          fields={[
            { key: 'name', label: t('saves.worlds.name'), value: '' },
            { key: 'address', label: t('saves.servers.address'), value: '', required: true, hint: t('saves.servers.addressHint') }
          ]}
          onClose={close}
          onSubmit={async (values) => {
            await api.saves.addServer(profile.id, values.name ?? '', values.address ?? '')
            reload()
            toast.success(t('saves.saved'))
          }}
        />
      )}

      {dialog?.kind === 'edit' && (
        <FormModal
          title={t('saves.servers.editTitle')}
          submitLabel={t('common.save')}
          fields={[
            { key: 'name', label: t('saves.worlds.name'), value: dialog.server.name },
            { key: 'address', label: t('saves.servers.address'), value: dialog.server.address, required: true, hint: t('saves.servers.addressHint') }
          ]}
          onClose={close}
          onSubmit={async (values) => {
            await api.saves.editServer(profile.id, dialog.server.index, {
              name: values.name ?? '',
              address: values.address ?? ''
            })
            reload()
            toast.success(t('saves.saved'))
          }}
        />
      )}

      {dialog?.kind === 'remove' && (
        <ConfirmModal
          title={t('saves.servers.removeTitle')}
          message={t('saves.servers.removeMessage', { name: dialog.server.name })}
          confirmLabel={t('saves.servers.remove')}
          onClose={close}
          onConfirm={async () => {
            await api.saves.removeServer(profile.id, dialog.server.index)
            reload()
            toast.success(t('saves.deleted'))
          }}
        />
      )}
    </div>
  )
}
