import { useCallback, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Link } from 'react-router'
import type { ProfileListItem, ProfileSyncPack, SyncPack } from '@shared/models'
import { useI18n } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { combineApplies } from '@/lib/syncResult'
import type { SyncJobSummary } from '@/lib/syncResult'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { LoaderBadge } from '@/components/Badges'
import { linkPackToProfiles } from '@/components/profile/linkSyncPacks'
import { SyncResultSummary } from '@/components/packs/SyncResultSummary'
import { UnlinkPackDialog } from '@/components/packs/UnlinkPackDialog'
import { useSyncRun } from '@/components/packs/useSyncRun'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { EmptyState, ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'

interface LinkedRow {
  profileId: string
  view: ProfileSyncPack | null
  error: string | null
}

const busyProfile = (profile: ProfileListItem | undefined): boolean =>
  profile !== undefined && (profile.running || profile.phase !== 'idle')

/**
 * The profiles a pack is linked to: per profile what it holds (installed, overridden, declined, failed with the
 * reason), retry and remove, linking to several profiles one after another, and "sync all".
 */
export function PackProfilesTab({ pack, onChanged }: { pack: SyncPack; onChanged: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const { track, jobs } = useJobs()

  const loadProfiles = useCallback(() => api.profiles.list(), [])
  const profiles = useAsync(loadProfiles)
  const loadRows = useCallback(async (): Promise<LinkedRow[]> => {
    return Promise.all(
      pack.profiles.map(async (profileId): Promise<LinkedRow> => {
        try {
          const view = await api.profiles.syncPacks.list(profileId)
          return { profileId, view: view.packs.find((entry) => entry.packId === pack.id) ?? null, error: null }
        } catch (error) {
          return { profileId, view: null, error: errorMessage(error) }
        }
      })
    )
  }, [pack.id, pack.profiles])
  const rows = useAsync(loadRows)

  // The pack reload hands down a new profile list, which loads the rows again.
  const reloadAll = (): void => {
    profiles.reload()
    onChanged()
  }
  // A finished pack job changes what the profiles hold; the page reloads the pack itself.
  useJobFinished((job) => {
    if (job.kind === 'syncpack') profiles.reload()
  })

  const run = useSyncRun()
  const [retrying, setRetrying] = useState<string | null>(null)
  const [removing, setRemoving] = useState<LinkedRow | null>(null)
  const [picked, setPicked] = useState<readonly string[]>([])
  const [linking, setLinking] = useState<{ done: number; total: number } | null>(null)
  const [linkResult, setLinkResult] = useState<{ summary: SyncJobSummary; errors: Array<{ name: string; message: string }> } | null>(null)

  const byId = useMemo(() => new Map((profiles.data ?? []).map((profile) => [profile.id, profile])), [profiles.data])
  const names = useMemo(() => new Map((profiles.data ?? []).map((profile) => [profile.id, profile.name])), [profiles.data])
  const unlinked = (profiles.data ?? []).filter((profile) => !pack.profiles.includes(profile.id))
  const syncRunning = jobs.some((job) => job.kind === 'syncpack' && job.state === 'running')
  const blocked = run.running || linking !== null || syncRunning

  const retry = async (profileId: string): Promise<void> => {
    setRetrying(profileId)
    await run.start(() => api.profiles.syncPacks.link(profileId, pack.id, true))
    setRetrying(null)
  }

  const togglePicked = (id: string, on: boolean): void =>
    setPicked((current) => (on ? [...current.filter((existing) => existing !== id), id] : current.filter((existing) => existing !== id)))

  const linkPicked = async (): Promise<void> => {
    const ids = picked.filter((id) => unlinked.some((profile) => profile.id === id))
    if (ids.length === 0 || blocked) return
    setLinkResult(null)
    setLinking({ done: 0, total: ids.length })
    try {
      const outcomes = await linkPackToProfiles(pack.id, ids, track, (_outcome, done, total) => setLinking({ done, total }))
      const applies = outcomes.flatMap((outcome) => (outcome.summary ? [{ ...outcome.summary, profileId: outcome.profileId }] : []))
      const errors = outcomes
        .filter((outcome) => outcome.error !== null)
        .map((outcome) => ({ name: names.get(outcome.profileId) ?? outcome.profileId, message: outcome.error ?? '' }))
      setLinkResult({ summary: combineApplies(applies), errors })
      setPicked([])
    } finally {
      setLinking(null)
      reloadAll()
    }
  }

  const linkedProfiles = rows.data ?? []

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-64 text-[13px] leading-[1.6] text-muted">{t('syncpacks.profiles.hint')}</p>
        <Button
          variant="primary"
          icon="lucide:refresh-cw"
          disabled={pack.profiles.length === 0 || blocked}
          loading={run.running && retrying === null}
          title={pack.profiles.length === 0 ? t('syncpacks.card.syncHint') : undefined}
          onClick={() => void run.start(() => api.syncpacks.sync(pack.id))}
        >
          {t('syncpacks.profiles.syncAll')}
        </Button>
      </div>

      {run.summary && <SyncResultSummary summary={run.summary} profileNames={names} onDismiss={run.dismiss} />}

      {profiles.error && <ErrorNotice message={profiles.error} onRetry={profiles.reload} />}
      {rows.error && <ErrorNotice message={rows.error} onRetry={rows.reload} />}
      {!rows.data && !rows.error && pack.profiles.length > 0 && <LoadingBlock />}

      {pack.profiles.length === 0 && (
        <EmptyState icon="lucide:unlink" title={t('syncpacks.profiles.empty.title')} description={t('syncpacks.profiles.empty.hint')} />
      )}

      {linkedProfiles.length > 0 && (
        <ul className="grid gap-3">
          {linkedProfiles.map((row) => {
            const profile = byId.get(row.profileId)
            const view = row.view
            const hold = busyProfile(profile)
            const problems = (view?.failed.length ?? 0) + (view?.declined.length ?? 0)
            return (
              <li key={row.profileId} className="grid gap-2.5 rounded-[10px] border border-line bg-surface-2 p-3.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="flex min-w-0 flex-1 basis-56 flex-wrap items-center gap-2">
                    <Link to={`/profiles/${encodeURIComponent(row.profileId)}`} className="min-w-0 truncate font-semibold hover:text-accent">
                      {profile?.name ?? row.profileId}
                    </Link>
                    {profile && <Badge icon="lucide:gamepad-2">{profile.minecraftVersion}</Badge>}
                    {profile && <LoaderBadge loader={profile.loader} />}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant={problems > 0 ? 'primary' : 'secondary'}
                      icon="lucide:rotate-cw"
                      disabled={blocked || hold}
                      loading={retrying === row.profileId && run.running}
                      title={hold ? t('profile.synced.gameRunning') : t('syncpacks.profiles.retryHint')}
                      onClick={() => void retry(row.profileId)}
                    >
                      {t('profile.syncpacks.retry')}
                    </Button>
                    <Button size="sm" variant="ghost" icon="lucide:unlink" disabled={blocked || hold} onClick={() => setRemoving(row)}>
                      {t('syncpacks.profiles.remove')}
                    </Button>
                  </div>
                </div>

                {row.error && <ErrorNotice message={row.error} onRetry={rows.reload} />}

                {view && (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="success" icon="lucide:check">
                        {t('syncpacks.status.installed', { count: view.files.length })}
                      </Badge>
                      {view.overridden.length > 0 && (
                        <Badge tone="warning" icon="lucide:shield">
                          {t('syncpacks.status.overridden', { count: view.overridden.length })}
                        </Badge>
                      )}
                      {view.declined.length > 0 && (
                        <Badge tone="neutral" icon="lucide:ban">
                          {t('syncpacks.status.declined', { count: view.declined.length })}
                        </Badge>
                      )}
                      {view.failed.length > 0 && (
                        <Badge tone="danger" icon="lucide:triangle-alert">
                          {t('syncpacks.status.failed', { count: view.failed.length })}
                        </Badge>
                      )}
                      {view.missing.length > 0 && (
                        <Badge tone="info" icon="lucide:clock">
                          {t('syncpacks.status.missing', { count: view.missing.length })}
                        </Badge>
                      )}
                    </div>
                    {view.overridden.length > 0 && (
                      <p className="text-[12.5px] leading-[1.5] text-subtle">
                        {t('syncpacks.status.overriddenNames', { names: view.overridden.map((entry) => entry.name).join(', ') })}
                      </p>
                    )}
                    {view.declined.length > 0 && (
                      <p className="text-[12.5px] leading-[1.5] text-subtle">
                        {t('syncpacks.status.declinedNames', { names: view.declined.map((entry) => entry.name).join(', ') })}
                      </p>
                    )}
                    {view.failed.length > 0 && (
                      <ul className="grid gap-1 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2">
                        {view.failed.map((failure) => (
                          <li key={`${failure.kind}:${failure.projectId}`} className="flex items-start gap-2 text-[13px] text-warning">
                            <Icon icon="lucide:triangle-alert" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 break-words">
                              <span className="font-semibold">{failure.name}</span>: {failure.reason}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {!view && !row.error && <p className="text-[13px] text-subtle">{t('syncpacks.status.unknown')}</p>}
              </li>
            )
          })}
        </ul>
      )}

      <section className="grid gap-3 rounded-[10px] border border-line p-3.5">
        <h4 className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{t('syncpacks.profiles.add')}</h4>
        {profiles.data && unlinked.length === 0 && (
          <p className="text-[13px] text-subtle">
            {profiles.data.length === 0 ? t('install.noProfiles') : t('syncpacks.profiles.allLinked')}
          </p>
        )}
        {!profiles.data && !profiles.error && <LoadingBlock />}
        {unlinked.length > 0 && (
          <>
            <ul className="grid gap-2 sm:grid-cols-2">
              {unlinked.map((profile) => (
                <li key={profile.id} className="min-w-0">
                  <Checkbox
                    checked={picked.includes(profile.id)}
                    disabled={blocked || busyProfile(profile)}
                    onChange={(on) => togglePicked(profile.id, on)}
                    label={
                      <span className="block truncate">
                        {profile.name}
                        <span className="ml-2 text-[12px] text-subtle">
                          {profile.minecraftVersion} · {profile.loader}
                        </span>
                      </span>
                    }
                    className="w-full"
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                icon="lucide:link"
                disabled={picked.length === 0 || blocked}
                loading={linking !== null}
                onClick={() => void linkPicked()}
              >
                {picked.length > 0 ? t('syncpacks.profiles.addCount', { count: picked.length }) : t('syncpacks.profiles.addButton')}
              </Button>
              {linking && (
                <span role="status" className="text-[13px] text-subtle tabular-nums">
                  {t('syncpacks.profiles.progress', { done: linking.done, total: linking.total })}
                </span>
              )}
            </div>
          </>
        )}
        {linkResult && (
          <div className="grid gap-2">
            <SyncResultSummary summary={linkResult.summary} profileNames={names} onDismiss={() => setLinkResult(null)} />
            {linkResult.errors.map((problem) => (
              <ErrorNotice key={problem.name} message={`${problem.name}: ${problem.message}`} />
            ))}
          </div>
        )}
      </section>

      {removing && (
        <UnlinkPackDialog
          profileId={removing.profileId}
          packId={pack.id}
          packName={pack.name}
          profileName={names.get(removing.profileId)}
          onClose={() => setRemoving(null)}
          onDone={(removed, kept) => {
            setRemoving(null)
            toast.success(t('profile.syncpacks.removed', { removed, kept }))
            reloadAll()
          }}
        />
      )}
    </div>
  )
}
