import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Job, Profile, ProfileListItem } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { LOADER_NAMES } from '@/lib/labels'
import { RunningStrip } from '@/components/games/RunningStrip'
import { CreateProfileModal } from '@/components/CreateProfileModal'
import { ImportProfilesDialog } from '@/components/imports/ImportProfilesDialog'
import { Stagger } from '@/components/motion/Stagger'
import { ProfileCard } from '@/components/ProfileCard'
import { ProfilePlaceholderCard } from '@/components/ProfilePlaceholderCard'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { EmptyState, ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Page } from '@/components/ui/Page'
import { useGames } from '@/state/games'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'

type SortKey = 'lastPlayed' | 'name' | 'created' | 'playtime'
const SORT_KEYS: readonly SortKey[] = ['lastPlayed', 'name', 'created', 'playtime']

/** Orders profiles by the chosen key; empty values (never played) go last. */
function sortProfiles(list: readonly ProfileListItem[], sort: SortKey, language: string): ProfileListItem[] {
  const sorted = [...list]
  sorted.sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name, language, { sensitivity: 'base' })
      case 'created':
        return b.createdAt.localeCompare(a.createdAt)
      case 'playtime':
        return b.totalPlaytimeMs - a.totalPlaytimeMs
      case 'lastPlayed':
        if (!a.lastPlayed && !b.lastPlayed) return a.name.localeCompare(b.name, language, { sensitivity: 'base' })
        if (!a.lastPlayed) return 1
        if (!b.lastPlayed) return -1
        return b.lastPlayed.localeCompare(a.lastPlayed)
    }
  })
  return sorted
}

function matches(profile: Profile, needle: string): boolean {
  if (needle === '') return true
  const haystack = [profile.name, profile.group ?? '', profile.minecraftVersion, profile.loader, LOADER_NAMES[profile.loader]]
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

export function ProfilesPage() {
  const { t, language } = useI18n()
  const toast = useToast()
  const load = useCallback(() => api.profiles.list(), [])
  const { data: profiles, error, loading, reload } = useAsync(load)
  const { jobs, cancel } = useJobs()
  const { entries: gameEntries } = useGames()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('lastPlayed')
  const [favouritesOnly, setFavouritesOnly] = useState(false)
  // Profile counts of the import jobs started here, so the finished job can say how many arrived.
  const pendingImports = useRef(new Map<string, number>())

  // An import finished: show the new profiles and report how many were copied.
  useJobFinished((job) => {
    if (job.kind !== 'import') return
    const count = pendingImports.current.get(job.id)
    pendingImports.current.delete(job.id)
    reload()
    if (job.state !== 'done') return
    if (count === undefined) toast.success(t('imports.done.generic'))
    else toast.success(count === 1 ? t('imports.done.one') : t('imports.done.many', { count }))
  })

  // Running jobs by profile (cards show their progress) and pack installs whose profile is not created yet.
  const jobByProfile = useMemo(() => {
    const map = new Map<string, Job>()
    for (const job of jobs) if (job.state === 'running' && job.profileId && !map.has(job.profileId)) map.set(job.profileId, job)
    return map
  }, [jobs])
  const placeholders = useMemo(
    () => jobs.filter((job) => job.state === 'running' && !job.profileId && (job.kind === 'pack-install' || job.kind === 'pack-import')),
    [jobs]
  )
  // The profile list reloads when a pack job learns its profile or leaves the running state.
  const packJobKey = jobs
    .filter((job) => job.kind === 'pack-install' || job.kind === 'pack-import')
    .map((job) => `${job.id}:${job.state}:${job.profileId ?? ''}`)
    .join('|')
  const firstPackJobKey = useRef(packJobKey)
  useEffect(() => {
    if (firstPackJobKey.current === packJobKey) return
    firstPackJobKey.current = packJobKey
    reload()
  }, [packJobKey, reload])
  const cancelJob = (job: Job): void => {
    cancel(job.id).catch((failure: unknown) => toast.error(failure))
  }
  const placeholderCards = placeholders.map((job) => <ProfilePlaceholderCard key={job.id} job={job} onCancel={cancelJob} />)

  // Cards show the running state from the live games list; the profile list reloads when a game starts or ends.
  const runningIds = useMemo(
    () => new Set(gameEntries.filter((entry) => entry.state !== 'launching').map((entry) => entry.profileId)),
    [gameEntries]
  )
  const runningKey = [...runningIds].sort().join('|')
  const firstRunningKey = useRef(runningKey)
  useEffect(() => {
    if (firstRunningKey.current === runningKey) return
    firstRunningKey.current = runningKey
    reload()
  }, [runningKey, reload])

  const needle = search.trim().toLowerCase()
  const visible = useMemo(
    () => sortProfiles((profiles ?? []).filter((p) => matches(p, needle) && (!favouritesOnly || p.favourite)), sort, language),
    [profiles, needle, favouritesOnly, sort, language]
  )

  // Favourites get their own section; every other profile sits in its group or in "ungrouped".
  const favourites = visible.filter((p) => p.favourite)
  const groups = useMemo(() => {
    const byName = new Map<string, ProfileListItem[]>()
    for (const profile of visible) {
      if (profile.favourite || !profile.group) continue
      const list = byName.get(profile.group) ?? []
      list.push(profile)
      byName.set(profile.group, list)
    }
    return [...byName.entries()].sort(([a], [b]) => a.localeCompare(b, language, { sensitivity: 'base' }))
  }, [visible, language])
  const ungrouped = visible.filter((p) => !p.favourite && !p.group)

  const toggleFavourite = async (profile: Profile): Promise<void> => {
    try {
      await api.profiles.update(profile.id, { favourite: !profile.favourite })
      reload()
    } catch (failure) {
      toast.error(failure)
    }
  }

  // The "new profile" tile opens the first grid, so it appears exactly once.
  const sections: Array<{ key: string; label: string; items: ProfileListItem[] }> = []
  if (favouritesOnly) {
    sections.push({ key: 'all', label: t('profiles.favourites'), items: visible })
  } else {
    if (favourites.length > 0) sections.push({ key: 'favourites', label: t('profiles.favourites'), items: favourites })
    for (const [name, items] of groups) sections.push({ key: `group:${name}`, label: name, items })
    if (ungrouped.length > 0) sections.push({ key: 'ungrouped', label: t('profiles.ungrouped'), items: ungrouped })
  }

  return (
    <Page>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('profiles.search')}>
          <TextInput
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('profiles.search')}
            className="w-full sm:w-64"
          />
        </Field>
        <Field label={t('profiles.sort.label')}>
          <Select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="w-full sm:w-48">
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`profiles.sort.${key}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant={favouritesOnly ? 'primary' : 'secondary'}
          icon="lucide:star"
          onClick={() => setFavouritesOnly((value) => !value)}
          aria-pressed={favouritesOnly}
        >
          {t('profiles.favouritesOnly')}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" icon="lucide:download" onClick={() => setImporting(true)}>
            {t('imports.button')}
          </Button>
          <Button variant="primary" icon="lucide:plus" onClick={() => setCreating(true)}>
            {t('profiles.new')}
          </Button>
        </div>
      </div>
      <RunningStrip />
      {error && <ErrorNotice message={error} onRetry={reload} />}
      {!profiles && loading && <LoadingBlock />}
      {profiles &&
        sections.map((section, index) => (
          <section key={section.key} className="grid gap-2.5">
            <h3 className="flex items-center gap-2 text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">
              {section.label}
              <span className="rounded-full bg-accent-soft px-1.5 text-[11px] leading-5 tracking-normal text-accent">
                {section.items.length}
              </span>
            </h3>
            <Stagger className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
              {index === 0 && placeholderCards}
              {section.items.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  job={jobByProfile.get(profile.id)}
                  running={runningIds.has(profile.id)}
                  onToggleFavourite={(target) => void toggleFavourite(target)}
                  onChanged={reload}
                />
              ))}
            </Stagger>
          </section>
        ))}
      {profiles && sections.length === 0 && placeholders.length > 0 && (
        <Stagger className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">{placeholderCards}</Stagger>
      )}
      {profiles && profiles.length > 0 && visible.length === 0 && placeholders.length === 0 && (
        <p className="text-center text-muted">{t('profiles.noMatches')}</p>
      )}
      {profiles && profiles.length === 0 && placeholders.length === 0 && (
        <EmptyState icon="lucide:layers" title={t('profiles.empty.title')} description={t('profiles.empty.description')} />
      )}
      {creating && <CreateProfileModal onClose={() => setCreating(false)} />}
      {importing && (
        <ImportProfilesDialog
          onClose={() => setImporting(false)}
          onStarted={(job, count) => pendingImports.current.set(job.id, count)}
        />
      )}
    </Page>
  )
}
