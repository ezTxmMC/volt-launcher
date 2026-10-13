import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import type { GameMode, Job, Profile, WorldInfo } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { formatBytes, formatRelative } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Stagger } from '@/components/motion/Stagger'
import { JobRow } from '@/components/JobRow'
import { useLaunchBlock } from '@/state/games'
import { launchFailureText, useGameBusy, useLaunchProfile } from '@/components/home/hooks/useLaunchProfile'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { CopyWorldModal, FormModal } from './dialogs'

type WorldDialog =
  | { kind: 'rename'; world: WorldInfo }
  | { kind: 'duplicate'; world: WorldInfo }
  | { kind: 'copy'; world: WorldInfo }
  | { kind: 'delete'; world: WorldInfo }

const GAME_MODE_KEYS: Record<Exclude<GameMode, ''>, 'saves.worlds.mode.survival' | 'saves.worlds.mode.creative' | 'saves.worlds.mode.adventure' | 'saves.worlds.mode.spectator'> = {
  survival: 'saves.worlds.mode.survival',
  creative: 'saves.worlds.mode.creative',
  adventure: 'saves.worlds.mode.adventure',
  spectator: 'saves.worlds.mode.spectator'
}

export function WorldsPanel({ profile }: { profile: Profile }) {
  const { t, language } = useI18n()
  const toast = useToast()
  const { jobs, track } = useJobs()
  const load = useCallback(() => api.saves.worlds(profile.id).then((result) => result.worlds), [profile.id])
  const { data: worlds, error, loading, reload } = useAsync(load)
  const [dialog, setDialog] = useState<WorldDialog | null>(null)
  const [jobIds, setJobIds] = useState<readonly string[]>([])
  const launchGame = useLaunchProfile()
  const { busy: gameBusy, reload: reloadGame } = useGameBusy(profile.id)
  const launchBlock = useLaunchBlock(profile.id)
  // Folder name of the world whose launch request is in flight; the launch job shows in the activity list.
  const [starting, setStarting] = useState<string | null>(null)

  const play = async (world: WorldInfo): Promise<void> => {
    setStarting(world.folderName)
    try {
      await launchGame(profile.id, { mode: 'singleplayer', world: world.folderName })
      reloadGame()
    } catch (error) {
      toast.notify('error', launchFailureText(error, t('quickPlay.gameRunning')))
    } finally {
      setStarting(null)
    }
  }

  // A finished job may have created or copied a world; refresh and report our own jobs.
  useJobFinished((job: Job) => {
    if (!jobIds.includes(job.id)) return
    reload()
    if (job.state === 'failed') toast.error(job.error ?? job.title)
    else if (job.state === 'done') toast.success(t('job.finished', { title: job.title }))
  })

  const ownJobs = jobs.filter((job) => jobIds.includes(job.id) && job.state === 'running')

  const startJob = (job: Job): void => {
    setJobIds((current) => [...current, job.id])
    track(job)
  }

  const close = (): void => setDialog(null)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button icon="lucide:refresh-cw" onClick={reload}>
          {t('saves.refresh')}
        </Button>
        {window.volt && (
          <Button
            icon="lucide:folder-open"
            onClick={() => void window.volt?.openPath(`${profile.gameDir}/saves`).then((problem) => problem && toast.error(problem))}
          >
            {t('saves.openFolder')}
          </Button>
        )}
      </div>

      {ownJobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}

      {error && <ErrorNotice message={error} onRetry={reload} />}
      {!worlds && loading && <LoadingBlock />}

      {worlds && worlds.length === 0 && (
        <EmptyState icon="lucide:map" title={t('saves.worlds.empty.title')} description={t('saves.worlds.empty.description')} />
      )}

      {worlds && worlds.length > 0 && (
        <Stagger as="ul" className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {worlds.map((world) => (
            <li key={world.folderName} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3">
              <WorldIcon profileId={profile.id} world={world} />
              <div className="min-w-0">
                <p className="truncate font-medium" title={world.name}>
                  {world.name}
                </p>
                <p className="truncate text-xs text-subtle" title={world.folderName}>
                  {world.folderName} · {formatBytes(world.sizeBytes, language)} ·{' '}
                  {t('saves.worlds.lastPlayed', { when: formatRelative(world.lastPlayed, language) })}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {!world.readable && <Badge tone="danger" icon="lucide:triangle-alert">{t('saves.worlds.unreadable')}</Badge>}
                  {world.gameMode && <Badge>{t(GAME_MODE_KEYS[world.gameMode])}</Badge>}
                  {world.hardcore && <Badge tone="danger">{t('saves.worlds.hardcore')}</Badge>}
                  <Badge tone="accent">{world.versionName || t('saves.worlds.unknownVersion')}</Badge>
                </div>
              </div>
              <div className="col-span-3 flex flex-wrap justify-end gap-1 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:flex-nowrap">
                <Button
                  variant="primary"
                  size="sm"
                  icon="lucide:play"
                  title={launchBlock.reason ?? t('quickPlay.playTitle', { name: world.name })}
                  disabled={gameBusy || launchBlock.blocked || !world.readable || starting !== null}
                  loading={starting === world.folderName}
                  onClick={() => void play(world)}
                >
                  {t('quickPlay.play')}
                </Button>
                <IconButton icon="lucide:pencil" label={t('saves.worlds.rename')} onClick={() => setDialog({ kind: 'rename', world })} />
                <IconButton icon="lucide:copy" label={t('saves.worlds.duplicate')} onClick={() => setDialog({ kind: 'duplicate', world })} />
                <IconButton icon="lucide:share-2" label={t('saves.worlds.copy')} onClick={() => setDialog({ kind: 'copy', world })} />
                <IconButton
                  icon="lucide:trash-2"
                  label={t('saves.worlds.delete')}
                  className="hover:text-danger"
                  onClick={() => setDialog({ kind: 'delete', world })}
                />
              </div>
            </li>
          ))}
        </Stagger>
      )}

      {dialog?.kind === 'rename' && (
        <FormModal
          title={t('saves.worlds.renameTitle')}
          submitLabel={t('saves.worlds.rename')}
          fields={[{ key: 'name', label: t('saves.worlds.name'), value: dialog.world.name, required: true }]}
          onClose={close}
          onSubmit={async (values) => {
            await api.saves.renameWorld(profile.id, dialog.world.folderName, values.name ?? '')
            reload()
            toast.success(t('saves.saved'))
          }}
        />
      )}

      {dialog?.kind === 'duplicate' && (
        <FormModal
          title={t('saves.worlds.duplicateTitle')}
          submitLabel={t('saves.worlds.duplicate')}
          fields={[
            {
              key: 'name',
              label: t('saves.worlds.name'),
              value: '',
              placeholder: `${dialog.world.name} (copy)`,
              hint: t('saves.worlds.duplicateHint', { name: dialog.world.name })
            }
          ]}
          onClose={close}
          onSubmit={async (values) => {
            startJob(await api.saves.duplicateWorld(profile.id, dialog.world.folderName, values.name ?? ''))
          }}
        />
      )}

      {dialog?.kind === 'copy' && (
        <CopyWorldModal
          worldName={dialog.world.name}
          excludeId={profile.id}
          onClose={close}
          onSubmit={async (targetProfileId) => {
            startJob(await api.saves.copyWorld(profile.id, dialog.world.folderName, targetProfileId))
          }}
        />
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmModal
          title={t('saves.worlds.deleteTitle')}
          message={t('saves.worlds.deleteMessage', { name: dialog.world.name })}
          confirmLabel={t('saves.worlds.delete')}
          onClose={close}
          onConfirm={async () => {
            await api.saves.deleteWorld(profile.id, dialog.world.folderName)
            reload()
          }}
        />
      )}
    </div>
  )
}

/** The world's icon.png, fetched once it is on screen; a placeholder otherwise. */
function WorldIcon({ profileId, world }: { profileId: string; world: WorldInfo }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!world.hasIcon) return
    let cancelled = false
    api.saves.worldIcon(profileId, world.folderName).then(
      (result) => {
        if (!cancelled) setSrc(result.dataUrl)
      },
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [profileId, world.folderName, world.hasIcon])

  if (src) {
    return <img src={src} alt="" className="size-12 rounded-md border border-line bg-surface-3 object-cover [image-rendering:pixelated]" />
  }
  return (
    <div className="grid size-12 place-items-center rounded-md border border-line bg-surface-3 text-subtle">
      <Icon icon="lucide:map" className="size-5" />
    </div>
  )
}
