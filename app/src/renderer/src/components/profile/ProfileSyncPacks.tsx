import { useCallback, useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import type { Profile, ProfileSyncPack } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { KIND_LABELS_SINGLE } from '@/lib/labels'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorNotice } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { Card } from '@/components/ui/Page'
import { Select } from '@/components/ui/Select'

const STATUS_POLL_MS = 3000

/**
 * The synced packs of one profile: each linked pack with its files and the entries the profile overrides.
 * Linking and removing are blocked while the game runs or the profile is busy with a job.
 */
export function ProfileSyncPacks({ profile }: { profile: Profile }) {
  const { t } = useI18n()
  const toast = useToast()
  const { jobs, track } = useJobs()

  const loadLinked = useCallback(() => api.profiles.syncPacks.list(profile.id), [profile.id])
  const linked = useAsync(loadLinked)
  const loadAll = useCallback(() => api.syncpacks.list(), [])
  const all = useAsync(loadAll)
  const loadGame = useCallback(() => api.game.status(profile.id), [profile.id])
  const { data: game, reload: reloadGame } = useAsync(loadGame)

  const [picked, setPicked] = useState('')
  const [linking, setLinking] = useState(false)
  const [removing, setRemoving] = useState<ProfileSyncPack | null>(null)

  useEffect(() => {
    const timer = setInterval(reloadGame, STATUS_POLL_MS)
    return () => clearInterval(timer)
  }, [reloadGame])

  // A finished sync or link changes what the profile holds.
  const { reload: reloadLinked } = linked
  const { reload: reloadAll } = all
  useJobFinished((job) => {
    if (job.kind !== 'syncpack') return
    reloadLinked()
    reloadAll()
  })

  const syncRunning = jobs.some((job) => job.kind === 'syncpack' && job.state === 'running')
  const gameBusy = game ? game.running || game.phase !== 'idle' : false
  const blocked = gameBusy || syncRunning || linking

  const packs = linked.data?.packs ?? []
  const linkedIds = new Set(packs.map((pack) => pack.packId))
  const available = (all.data?.packs ?? []).filter((pack) => !linkedIds.has(pack.id))
  const chosen = available.some((pack) => pack.id === picked) ? picked : (available[0]?.id ?? '')

  const link = async (): Promise<void> => {
    if (chosen === '' || blocked) return
    setLinking(true)
    try {
      track(await api.profiles.syncPacks.link(profile.id, chosen))
      setPicked('')
    } catch (error) {
      toast.error(error)
    } finally {
      setLinking(false)
    }
  }

  return (
    <Card className="grid content-start gap-4">
      <h3 className="text-base font-semibold">{t('profile.syncpacks.title')}</h3>
      <p className="text-[13px] leading-[1.6] text-muted">{t('profile.syncpacks.hint')}</p>

      {gameBusy && (
        <p className="flex items-center gap-2 text-[13px] font-medium text-warning">
          <Icon icon="lucide:circle-alert" className="size-4 shrink-0" aria-hidden="true" />
          {t('profile.synced.gameRunning')}
        </p>
      )}
      {!gameBusy && syncRunning && <p className="text-[13px] text-subtle">{t('profile.syncpacks.busy')}</p>}

      {linked.error && <ErrorNotice message={linked.error} onRetry={linked.reload} />}

      {linked.data !== undefined && packs.length === 0 && (
        <p className="rounded-[10px] border border-line px-3.5 py-3 text-[13px] text-subtle">{t('profile.syncpacks.empty')}</p>
      )}

      {packs.map((pack) => (
        <section key={pack.packId} className="grid gap-3 rounded-[10px] border border-line bg-surface-2 p-3.5">
          <header className="flex min-w-0 items-center justify-between gap-3">
            <h4 className="min-w-0 truncate font-semibold">{pack.name}</h4>
            <Button size="sm" variant="ghost" icon="lucide:unlink" disabled={blocked} onClick={() => setRemoving(pack)}>
              {t('profile.syncpacks.remove')}
            </Button>
          </header>

          {pack.files.length === 0 && pack.overridden.length === 0 ? (
            <p className="text-[13px] text-subtle">{t('profile.syncpacks.noFiles')}</p>
          ) : (
            <ul className="grid gap-1.5">
              {pack.files.map((file) => (
                <li key={file.fileName} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{file.name}</span>
                  <Badge tone="neutral">{t(KIND_LABELS_SINGLE[file.kind])}</Badge>
                  {file.dependency && <Badge tone="info">{t('profile.syncpacks.dependency')}</Badge>}
                </li>
              ))}
              {pack.overridden.map((entry) => (
                <li key={`override-${entry.projectId}`} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-subtle">{entry.name}</span>
                  <Badge tone="warning">{t(KIND_LABELS_SINGLE[entry.kind])}</Badge>
                  <Badge tone="warning">{t('profile.syncpacks.overridden')}</Badge>
                </li>
              ))}
            </ul>
          )}

          {pack.declined.length > 0 && (
            <p className="text-[12px] leading-[1.5] text-subtle">{t('profile.syncpacks.declined', { count: pack.declined.length })}</p>
          )}
          {pack.missing.length > 0 && (
            <p className="text-[12px] leading-[1.5] text-subtle">{t('profile.syncpacks.missing', { count: pack.missing.length })}</p>
          )}
        </section>
      ))}

      {all.data !== undefined && (
        <div className="grid gap-2">
          {available.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-0 flex-1 basis-56 gap-1.5">
                <span className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{t('profile.syncpacks.pick')}</span>
                <Select
                  ariaLabel={t('profile.syncpacks.pick')}
                  value={chosen}
                  onChange={setPicked}
                  disabled={blocked}
                  options={available.map((pack) => ({ value: pack.id, label: pack.name }))}
                />
              </div>
              <Button variant="secondary" icon="lucide:plus" disabled={blocked || chosen === ''} loading={linking} onClick={() => void link()}>
                {t('profile.syncpacks.add')}
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-subtle">
              {all.data.packs.length === 0 ? t('profile.syncpacks.noPacks') : t('profile.syncpacks.noneLeft')}
            </p>
          )}
        </div>
      )}

      {removing && (
        <UnlinkDialog
          profileId={profile.id}
          pack={removing}
          onClose={() => setRemoving(null)}
          onDone={(removed, kept) => {
            setRemoving(null)
            toast.success(t('profile.syncpacks.removed', { removed, kept }))
            reloadLinked()
          }}
        />
      )}
    </Card>
  )
}

/** Asks what happens to the pack's files: keep them as ordinary content, or remove them from the profile. */
function UnlinkDialog({
  profileId,
  pack,
  onClose,
  onDone
}: {
  profileId: string
  pack: ProfileSyncPack
  onClose: () => void
  onDone: (removed: number, kept: number) => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const unlink = async (removeFiles: boolean): Promise<void> => {
    setBusy(true)
    try {
      const result = await api.profiles.syncPacks.unlink(profileId, pack.packId, removeFiles)
      onDone(result.removed.length, result.kept.length)
    } catch (error) {
      toast.error(error)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('profile.syncpacks.removeTitle', { name: pack.name })}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="secondary" icon="lucide:link" loading={busy} onClick={() => void unlink(false)}>
            {t('profile.syncpacks.keep')}
          </Button>
          <Button variant="danger" icon="lucide:trash-2" disabled={busy} onClick={() => void unlink(true)}>
            {t('profile.syncpacks.removeFiles')}
          </Button>
        </>
      }
    >
      <p className="text-muted">{t('profile.syncpacks.removeMessage')}</p>
    </Modal>
  )
}
