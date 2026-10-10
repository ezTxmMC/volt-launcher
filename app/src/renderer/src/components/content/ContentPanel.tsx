import { useCallback, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router'
import type { ContentType, DependencyWarning, Job, ModFile, Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { formatBytes } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { LoaderBadge, ProviderBadge } from '@/components/Badges'
import { ConfirmModal } from '@/components/ConfirmModal'
import { JobRow } from '@/components/JobRow'
import { ModLogo } from '@/components/mods/ModLogo'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { TextInput } from '@/components/ui/Field'
import { Switch } from '@/components/ui/Switch'
import { VersionDialog } from './VersionDialog'

/** Name shown for a file: the mod's own name, else the project name, else the file name. */
function displayName(file: ModFile): string {
  return file.metadata?.name || file.source?.name || file.fileName
}

/** The Discover filter that shows the projects of a content type. */
const DISCOVER_KIND: Record<ContentType, string> = {
  mods: 'mod',
  resourcepacks: 'resourcepack',
  shaderpacks: 'shader',
  datapacks: 'datapack'
}

/** The folder of a content type, as the user sees it in the game directory. */
function folderOf(profile: Profile, type: ContentType, world?: string): string {
  if (type === 'datapacks') return `${profile.gameDir}/saves/${world ?? ''}/datapacks`
  return `${profile.gameDir}/${type}`
}

/**
 * The file list of one content type (mods, resource packs, shader packs, data packs):
 * toggle, toggle all, update, version switch, delete, identify and update checks.
 * Data packs take the world they belong to. Mods also show dependency problems.
 */
export function ContentPanel({ profile, type, world }: { profile: Profile; type: ContentType; world?: string }) {
  const navigate = useNavigate()
  const { t, language } = useI18n()
  const toast = useToast()
  const { jobs, track } = useJobs()
  const isMods = type === 'mods'

  const load = useCallback(() => api.content.list(profile.id, type, world), [profile.id, type, world])
  const { data: files, error, loading, reload } = useAsync(load)
  const loadWarnings = useCallback(
    (): Promise<{ warnings: DependencyWarning[] }> =>
      isMods ? api.content.dependencies(profile.id, type) : Promise.resolve({ warnings: [] }),
    [profile.id, type, isMods]
  )
  const { data: dependencies, reload: reloadWarnings } = useAsync(loadWarnings)

  const [filter, setFilter] = useState('')
  const [toolbarBusy, setToolbarBusy] = useState<string | null>(null)
  const [rowBusy, setRowBusy] = useState<ReadonlySet<string>>(new Set())
  const [jobIds, setJobIds] = useState<readonly string[]>([])
  const [removing, setRemoving] = useState<ModFile | null>(null)
  const [versionsOf, setVersionsOf] = useState<ModFile | null>(null)

  // Any finished job may have changed the folder, so refresh the lists.
  useJobFinished((job) => {
    reload()
    reloadWarnings()
    if (jobIds.includes(job.id)) {
      if (job.state === 'failed') toast.error(job.error ?? job.title)
      else if (job.state === 'done') toast.success(t('job.finished', { title: job.title }))
    }
  })

  const ownJobs = jobs.filter((job) => jobIds.includes(job.id) && job.state === 'running')
  const jobRunning = ownJobs.length > 0

  const sorted = useMemo(
    () => [...(files ?? [])].sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' })),
    [files]
  )
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return sorted
    return sorted.filter((file) => `${displayName(file)} ${file.fileName}`.toLowerCase().includes(needle))
  }, [sorted, filter])
  const updateCount = sorted.filter((file) => file.update !== null).length
  const warnings = dependencies?.warnings ?? []

  const startJob = async (key: string, start: () => Promise<Job>): Promise<void> => {
    setToolbarBusy(key)
    try {
      const job = await start()
      setJobIds((current) => [...current, job.id])
      track(job)
    } catch (error) {
      toast.error(error)
    } finally {
      setToolbarBusy(null)
    }
  }

  const withRow = async (fileName: string, action: () => Promise<void>): Promise<void> => {
    setRowBusy((current) => new Set(current).add(fileName))
    try {
      await action()
    } catch (error) {
      toast.error(error)
    } finally {
      setRowBusy((current) => {
        const next = new Set(current)
        next.delete(fileName)
        return next
      })
    }
  }

  const toggle = (file: ModFile): Promise<void> =>
    withRow(file.fileName, async () => {
      await api.content.toggle(profile.id, type, file.fileName, world)
      reload()
      reloadWarnings()
    })

  const updateOne = (file: ModFile): Promise<void> =>
    withRow(file.fileName, async () => {
      const job = await api.content.update(profile.id, type, file.fileName, world)
      setJobIds((current) => [...current, job.id])
      track(job)
    })

  const toggleAll = async (enabled: boolean): Promise<void> => {
    setToolbarBusy(enabled ? 'enableAll' : 'disableAll')
    try {
      const result = await api.content.toggleAll(profile.id, type, enabled, world)
      toast.success(t('content.toggleAllDone', { changed: result.changed }))
      if (result.skipped.length > 0) toast.error(t('content.toggleAllSkipped', { count: result.skipped.length }))
      reload()
      reloadWarnings()
    } catch (error) {
      toast.error(error)
    } finally {
      setToolbarBusy(null)
    }
  }

  const openFolder = async (): Promise<void> => {
    const problem = await window.volt?.openPath(folderOf(profile, type, world))
    if (problem) toast.error(problem)
  }

  const needsWorld = type === 'datapacks' && !world

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Icon icon="lucide:search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <TextInput
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('content.filter')}
            aria-label={t('content.filter')}
            className="w-full pl-9"
          />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            icon="lucide:fingerprint"
            disabled={jobRunning || needsWorld}
            loading={toolbarBusy === 'identify'}
            onClick={() => void startJob('identify', () => api.content.identify(profile.id, type, world))}
          >
            {t('content.identify')}
          </Button>
          <Button
            icon="lucide:refresh-cw"
            disabled={jobRunning || needsWorld}
            loading={toolbarBusy === 'check'}
            onClick={() => void startJob('check', () => api.content.checkUpdates(profile.id, type, world))}
          >
            {t('content.checkUpdates')}
          </Button>
          <Button
            variant="primary"
            icon="lucide:circle-arrow-up"
            disabled={jobRunning || updateCount === 0}
            loading={toolbarBusy === 'all'}
            onClick={() => void startJob('all', () => api.content.updateAll(profile.id, type, world))}
          >
            {updateCount > 0 ? t('content.updateAllCount', { count: updateCount }) : t('content.updateAll')}
          </Button>
        </div>
      </div>

      {sorted.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button icon="lucide:toggle-right" loading={toolbarBusy === 'enableAll'} disabled={toolbarBusy !== null} onClick={() => void toggleAll(true)}>
            {t('content.enableAll')}
          </Button>
          <Button icon="lucide:toggle-left" loading={toolbarBusy === 'disableAll'} disabled={toolbarBusy !== null} onClick={() => void toggleAll(false)}>
            {t('content.disableAll')}
          </Button>
          {window.volt && (
            <Button icon="lucide:folder-open" onClick={() => void openFolder()}>
              {t('content.openFolder')}
            </Button>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="grid gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-warning">
            <Icon icon="lucide:triangle-alert" className="size-4" />
            {t('content.dependencyWarning', { n: warnings.length })}
          </p>
          {warnings.map((warning) => (
            <p key={`${warning.fileName}|${warning.dependencyProjectId}`} className="text-muted">
              {t(warning.state === 'missing' ? 'content.dependencyMissing' : 'content.dependencyDisabled', {
                project: warning.projectName,
                file: warning.fileName
              })}
            </p>
          ))}
        </div>
      )}

      {ownJobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}

      {needsWorld && <p className="text-muted">{t('content.worldHint')}</p>}
      {error && <ErrorNotice message={error} onRetry={reload} />}
      {!files && loading && !needsWorld && <LoadingBlock />}

      {files && sorted.length === 0 && (
        <EmptyState
          icon="lucide:package-open"
          title={t('content.empty.title')}
          description={t('content.empty.description')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {/* Same Button as the folder action, so both have the same size. */}
              <Button variant="primary" icon="lucide:compass" onClick={() => navigate(`/discover?kind=${DISCOVER_KIND[type]}`)}>
                {t('content.empty.discover')}
              </Button>
              {window.volt && (
                <Button icon="lucide:folder-open" onClick={() => void openFolder()}>
                  {t('content.openFolder')}
                </Button>
              )}
            </div>
          }
        />
      )}

      {files && sorted.length > 0 && (
        <>
          <p className="text-muted">{t('content.summary', { count: sorted.length, updates: updateCount })}</p>
          {visible.length === 0 ? (
            <p className="py-10 text-center text-muted">{t('content.noMatches')}</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {visible.map((file) => (
                <ContentRow
                  key={file.fileName}
                  file={file}
                  isMods={isMods}
                  busy={rowBusy.has(file.fileName)}
                  locked={jobRunning}
                  sizeLabel={formatBytes(file.size, language)}
                  onToggle={() => void toggle(file)}
                  onUpdate={() => void updateOne(file)}
                  onVersions={() => setVersionsOf(file)}
                  onRemove={() => setRemoving(file)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {removing && (
        <ConfirmModal
          title={t('content.removeTitle')}
          message={t('content.removeMessage', { name: displayName(removing) })}
          confirmLabel={t('content.remove')}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await api.content.remove(profile.id, type, removing.fileName, world)
            reload()
            reloadWarnings()
          }}
        />
      )}

      {versionsOf && (
        <VersionDialog
          profile={profile}
          type={type}
          world={world}
          file={versionsOf}
          onClose={() => setVersionsOf(null)}
          onStarted={(job) => {
            setJobIds((current) => [...current, job.id])
            track(job)
          }}
        />
      )}
    </div>
  )
}

function ContentRow({
  file,
  isMods,
  busy,
  locked,
  sizeLabel,
  onToggle,
  onUpdate,
  onVersions,
  onRemove
}: {
  file: ModFile
  isMods: boolean
  busy: boolean
  /** True while a job runs for this profile; blocks starting another update. */
  locked: boolean
  sizeLabel: string
  onToggle: () => void
  onUpdate: () => void
  onVersions: () => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const name = displayName(file)
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 xl:grid-cols-[auto_1fr_auto_auto]">
      <Switch
        checked={file.enabled}
        disabled={busy}
        onChange={onToggle}
        label={t(file.enabled ? 'content.disable' : 'content.enable', { name })}
      />
      <div className={`flex min-w-0 items-center gap-3 ${file.enabled ? '' : 'opacity-55'}`}>
        {isMods && <ModLogo provider={file.source?.provider} projectId={file.source?.projectId} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={name}>
            {name}
            {file.metadata?.version && <span className="ml-2 font-normal text-muted">{file.metadata.version}</span>}
          </p>
          <p className="truncate text-xs text-subtle" title={file.fileName}>
            {file.fileName} · {sizeLabel}
          </p>
        </div>
      </div>
      <div className="col-start-3 row-start-1 flex items-center gap-1 xl:col-start-4">
        <IconButton icon="lucide:history" label={t('content.changeVersion')} onClick={onVersions} disabled={busy || locked} />
        <IconButton
          icon="lucide:trash-2"
          label={t('content.removeNamed', { name })}
          onClick={onRemove}
          className="hover:text-danger"
        />
      </div>
      <div className="col-start-2 col-end-4 flex flex-wrap items-center gap-1.5 xl:col-start-3 xl:col-end-4 xl:row-start-1 xl:justify-end">
        {isMods && <LoaderBadge loader={file.metadata?.loader ?? 'unknown'} />}
        {file.source ? <ProviderBadge provider={file.source.provider} /> : <Badge tone="neutral">{t('content.unidentified')}</Badge>}
        {!file.enabled && <Badge tone="warning">{t('content.disabled')}</Badge>}
        {file.update && (
          <>
            <Badge tone="accent" icon="lucide:circle-arrow-up">
              {t('content.updateAvailable', { version: file.update.versionNumber })}
            </Badge>
            <Button size="sm" variant="primary" loading={busy} disabled={locked} onClick={onUpdate}>
              {t('content.update')}
            </Button>
          </>
        )}
      </div>
    </li>
  )
}
