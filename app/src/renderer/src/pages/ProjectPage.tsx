import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { useNavigate, useParams } from 'react-router'
import type { Profile, ProjectVersion, ProviderId, SortOption } from '@shared/models'
import { useI18n } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { PROVIDER_NAMES } from '@/lib/labels'
import { useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { KindBadge, ProviderBadge } from '@/components/Badges'
import { InstallTargetModal } from '@/components/InstallTargetModal'
import { InstallPackDialog } from '@/components/content/PackDialogs'
import { Markdown } from '@/components/Markdown'
import { Badge } from '@/components/ui/Badge'
import type { Tone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Checkbox } from '@/components/ui/Checkbox'
import { Card, Page } from '@/components/ui/Page'
import { Select } from '@/components/ui/Select'
import { ProjectIcon } from '@/components/ui/ProjectIcon'
import { ChoiceFilter } from '@/components/discover/filters/FilterFields'
import { loaderChoices, loaderLabel } from '@/components/discover/filters/model'
import { useInstallTarget } from '@/components/discover/useInstallTarget'
import { useProviderFilters } from '@/components/discover/useProviderFilters'

const NO_SORTS: SortOption[] = []

/** Release channel badges of the version list (old install dialog colours, as badge tones). */
const RELEASE_TONES: Record<string, Tone> = { release: 'success', beta: 'warning', alpha: 'danger' }
const RELEASE_LABELS: Record<string, MessageKey> = {
  release: 'release.release',
  beta: 'release.beta',
  alpha: 'release.alpha'
}

function galleryUrls(gallery: ReadonlyArray<string | { url?: string }>): string[] {
  return gallery.flatMap((entry) => {
    const url = typeof entry === 'string' ? entry : entry.url
    return url ? [url] : []
  })
}

export function ProjectPage() {
  const { t, language } = useI18n()
  const toast = useToast()
  const { track } = useJobs()
  const { provider = '', id = '' } = useParams()
  const providerId = provider as ProviderId

  const loadProject = useCallback(() => api.providers.project(providerId, id), [providerId, id])
  const { data: project, error, reload } = useAsync(loadProject)
  const loadProfiles = useCallback(() => api.profiles.list(), [])
  const { data: profiles } = useAsync(loadProfiles)

  // The install target is the one chosen in Discover (or `?profile=`); it is kept for the session.
  const [targetId, setTargetId] = useInstallTarget()
  const [picking, setPicking] = useState<ProjectVersion | null>(null)
  const [withDependencies, setWithDependencies] = useState(true)
  const [packVersion, setPackVersion] = useState<ProjectVersion | null>(null)

  const target: Profile | undefined = profiles?.find((profile) => profile.id === targetId)
  const isPack = project?.kind === 'modpack'

  // The version filters start empty; choosing a target profile fills them from that profile.
  const [gameVersion, setGameVersion] = useState('')
  const [loaderFilter, setLoaderFilter] = useState('')
  const { filters: versionFilters } = useProviderFilters(project ? providerId : undefined, project?.kind, NO_SORTS)
  const filterGameVersion = versionFilters?.supports.gameVersion && gameVersion ? gameVersion : undefined
  const filterLoader = versionFilters?.supports.loader && loaderFilter ? loaderFilter : undefined

  const applyProfileFilters = useCallback(
    (chosen: Profile | undefined): void => {
      setGameVersion(chosen?.minecraftVersion ?? '')
      setLoaderFilter(chosen && project?.kind === 'mod' && chosen.loader !== 'vanilla' ? chosen.loader : '')
    },
    [project?.kind]
  )
  const chooseProfile = (profileId: string): void => {
    setTargetId(profileId)
    applyProfileFilters(profiles?.find((profile) => profile.id === profileId))
  }

  // A target that was chosen before the page opened fills the version filters once its data is there.
  const filled = useRef('')
  useEffect(() => {
    if (!target || !project || filled.current === `${target.id}|${project.id}`) return
    filled.current = `${target.id}|${project.id}`
    applyProfileFilters(target)
  }, [target, project, applyProfileFilters])

  const loadVersions = useCallback(
    () => api.providers.versions(providerId, id, { gameVersion: filterGameVersion, loader: filterLoader }),
    [providerId, id, filterGameVersion, filterLoader]
  )
  const { data: versions, error: versionsError, loading: versionsLoading, reload: reloadVersions } = useAsync(loadVersions)

  // Success and failure of the job are announced globally (JobsProvider). The dialog reports a failed start.
  const installPack = async (version: ProjectVersion, name: string): Promise<void> => {
    const job = await api.providers.installPack(providerId, id, version.id, name)
    track(job)
    toast.info(t('project.installStarted'))
  }

  const installContent = async (version: ProjectVersion, profile: Profile): Promise<void> => {
    if (!project) return
    try {
      const job = await api.providers.installContent(profile.id, {
        provider: providerId,
        projectId: id,
        versionId: version.id,
        kind: project.kind,
        withDependencies
      })
      track(job)
      setTargetId(profile.id)
      toast.info(t('project.installingInto', { profile: profile.name }))
    } catch (error) {
      toast.error(error)
      throw error
    }
  }

  const onInstall = (version: ProjectVersion): void => {
    if (isPack) setPackVersion(version)
    else if (target) void installContent(version, target).catch(() => undefined)
    else setPicking(version)
  }

  if (!project) {
    return (
      <Page>
        <BackLink />
        {error ? <ErrorNotice message={error} onRetry={reload} /> : <LoadingBlock />}
      </Page>
    )
  }

  const gallery = galleryUrls(project.gallery ?? [])

  return (
    <Page>
      <BackLink />
      <div className="flex flex-wrap items-start gap-5">
        <ProjectIcon url={project.iconUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-bold">{project.name}</h2>
          <p className="mt-1 text-muted">{t('project.by', { author: project.author })}</p>
          <p className="mt-2 max-w-3xl text-muted">{project.summary}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <KindBadge kind={project.kind} />
            <ProviderBadge provider={project.provider} />
            <Badge icon="lucide:download">{formatNumber(project.downloads, language)}</Badge>
            {project.categories.map((category) => (
              <Badge key={category}>{category}</Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_26rem]">
        <div className="grid min-w-0 gap-6">
          {gallery.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {gallery.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-40 shrink-0 rounded-xl border border-line object-cover"
                />
              ))}
            </div>
          )}
          <Card>
            <h3 className="mb-3 text-base font-semibold">{t('project.description')}</h3>
            {project.description.trim() ? <Markdown source={project.description} /> : <p className="text-muted">{t('project.noDescription')}</p>}
          </Card>
        </div>

        <Card className="grid gap-4 lg:sticky lg:top-4">
          <h3 className="text-base font-semibold">{t('project.versions')}</h3>
          {!isPack && (
            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium text-muted">{t('project.targetProfile')}</span>
              <Select
                ariaLabel={t('project.targetProfile')}
                value={targetId}
                onChange={chooseProfile}
                options={[
                  { value: '', label: t('project.anyProfile') },
                  ...(profiles ?? []).map((profile) => ({
                    value: profile.id,
                    label: `${profile.name} (${profile.minecraftVersion}, ${profile.loader})`
                  }))
                ]}
              />
            </div>
          )}
          {!isPack && project.kind === 'mod' && (
            <Checkbox checked={withDependencies} onChange={setWithDependencies} label={t('install.withDependencies')} />
          )}
          {versionFilters && (versionFilters.supports.gameVersion || versionFilters.supports.loader) && (
            <div role="group" aria-label={t('discover.versions.filters')} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {versionFilters.supports.gameVersion && (
                <label className="grid min-w-0 gap-1.5">
                  <span className="text-[13px] font-medium text-muted">{t('discover.version')}</span>
                  <ChoiceFilter
                    label={t('discover.version')}
                    placeholder={t('discover.version')}
                    value={gameVersion}
                    options={versionFilters.gameVersions}
                    anyLabel={t('discover.anyVersion')}
                    onChange={setGameVersion}
                    className="w-full"
                  />
                </label>
              )}
              {versionFilters.supports.loader && (
                <label className="grid min-w-0 gap-1.5">
                  <span className="text-[13px] font-medium text-muted">{t('discover.loader')}</span>
                  <ChoiceFilter
                    label={t('discover.loader')}
                    placeholder={t('discover.loader')}
                    value={loaderFilter}
                    options={loaderChoices(versionFilters.loaders)}
                    anyLabel={t('discover.anyLoader')}
                    labelOf={loaderLabel}
                    onChange={setLoaderFilter}
                    className="w-full"
                  />
                </label>
              )}
            </div>
          )}
          {versionsError && <ErrorNotice message={versionsError} onRetry={reloadVersions} />}
          {!versions && versionsLoading && <LoadingBlock />}
          {versions && versions.length === 0 && (
            <p className="py-6 text-center text-muted">
              {filterGameVersion || filterLoader ? t('discover.versions.empty') : t('project.noVersions')}
            </p>
          )}
          {versions && versions.length > 0 && (
            <ul className="-mx-1 grid min-w-0 grid-cols-1 max-h-[32rem] gap-2 overflow-y-auto px-1">
              {versions.map((version) => (
                <li key={version.id} className="grid min-w-0 grid-cols-1 gap-2 rounded-lg border border-line bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium" title={version.name}>
                        {version.name}
                      </p>
                      <p className="text-xs text-muted">
                        {version.versionNumber} · {formatDate(version.datePublished, language)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={isPack ? 'lucide:package-plus' : 'lucide:download'}
                      onClick={() => onInstall(version)}
                    >
                      {isPack ? t('project.installAsProfile') : t('project.installIntoProfile')}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {RELEASE_LABELS[version.releaseType] && (
                      <Badge tone={RELEASE_TONES[version.releaseType] ?? 'neutral'}>
                        {t(RELEASE_LABELS[version.releaseType] as MessageKey)}
                      </Badge>
                    )}
                    {version.gameVersions.slice(0, 4).map((gameVersion) => (
                      <Badge key={gameVersion}>{gameVersion}</Badge>
                    ))}
                    {version.gameVersions.length > 4 && <Badge>+{version.gameVersions.length - 4}</Badge>}
                    {version.loaders.map((loader) => (
                      <Badge key={loader} tone="info">
                        {loader}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-subtle">{t('project.source', { provider: PROVIDER_NAMES[project.provider] ?? project.provider })}</p>
        </Card>
      </div>

      {packVersion && (
        <InstallPackDialog
          projectName={project.name}
          versionNumber={packVersion.versionNumber}
          takenNames={profiles?.map((profile) => profile.name)}
          onInstall={(name) => installPack(packVersion, name)}
          onClose={() => setPackVersion(null)}
        />
      )}
      {picking && profiles && (
        <InstallTargetModal
          profiles={profiles}
          initialProfileId={targetId}
          versionLabel={`${project.name} ${picking.versionNumber}`}
          onClose={() => setPicking(null)}
          onConfirm={(profile) => installContent(picking, profile)}
        />
      )}
    </Page>
  )
}

function BackLink() {
  const { t } = useI18n()
  const navigate = useNavigate()
  // Going back keeps the search state of the Discover page; fall back to it on a fresh start.
  const goBack = (): void => {
    if (window.history.length > 1) void navigate(-1)
    else void navigate('/discover')
  }
  return (
    <button type="button" onClick={goBack} className="inline-flex w-fit items-center gap-1 text-muted hover:text-fg">
      <Icon icon="lucide:arrow-left" className="size-4" />
      {t('project.back')}
    </button>
  )
}
