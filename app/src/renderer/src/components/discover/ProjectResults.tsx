import { useState, type ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { Link } from 'react-router'
import type { ProjectSummary } from '@shared/models'
import { KIND_ICONS, KIND_LABELS_SINGLE } from '@/lib/labels'
import { formatNumber, formatRelative } from '@/lib/format'
import { useI18n } from '@/i18n'
import { Stagger } from '@/components/motion/Stagger'
import { ProjectIcon } from '@/components/ui/ProjectIcon'
import { QuickAddModal } from './QuickAddModal'
import { categoryIcon, categoryLabel, loaderColor, loaderIcon, loaderLabel } from './filters/model'
import type { DiscoverView } from './useDiscoverPrefs'

const LIST_TAGS = 6
const GRID_TAGS = 3

/** What a result shows as its install action; the default is the "+" that asks for a profile. */
export type RenderAction = (project: ProjectSummary) => ReactNode

function detailPath(project: ProjectSummary, profileId?: string): string {
  const base = `/discover/${project.provider}/${encodeURIComponent(project.id)}`
  return profileId ? `${base}?profile=${encodeURIComponent(profileId)}` : base
}

/**
 * Chips of a project: the kind, its loaders (coloured, with their icon) and its categories.
 * Only the first `limit` are shown; the rest collapse into a "+N" chip that names them.
 */
function ProjectTags({ project, limit }: { project: ProjectSummary; limit: number }) {
  const { t } = useI18n()
  const chips: Array<{ key: string; icon: string; label: string; color?: string }> = [
    { key: `kind:${project.kind}`, icon: KIND_ICONS[project.kind], label: t(KIND_LABELS_SINGLE[project.kind]) },
    ...(project.loaders ?? []).map((id) => ({
      key: `loader:${id}`,
      icon: loaderIcon(id),
      label: loaderLabel(id),
      color: loaderColor(id)
    })),
    ...project.categories.map((id) => {
      const label = categoryLabel({ id, label: id })
      return { key: `category:${id}`, icon: categoryIcon(id), label }
    })
  ]
  const shown = chips.slice(0, limit)
  const hidden = chips.slice(limit)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-md border border-line bg-white/[0.035] px-2 py-0.5 text-[12px] text-muted"
        >
          <Icon icon={chip.icon} aria-hidden="true" className="size-3 shrink-0" style={chip.color ? { color: chip.color } : undefined} />
          <span className="truncate">{chip.label}</span>
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          title={t('discover.tags.more', { tags: hidden.map((chip) => chip.label).join(', ') })}
          className="rounded-md border border-line bg-white/[0.035] px-2 py-0.5 text-[12px] text-muted"
        >
          +{hidden.length}
        </span>
      )}
    </div>
  )
}

/** The "+" button of a card: installs the project into a chosen profile. Not for modpacks, which create their own profile. */
export function QuickAddButton({ project, className = '' }: { project: ProjectSummary; className?: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (project.kind === 'modpack') return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('discover.quickAdd')}
        title={t('discover.quickAdd')}
        className={`z-10 grid size-7 shrink-0 place-items-center rounded-[7px] border border-[var(--accent-border-strong)] bg-accent-soft text-accent transition-colors hover:bg-accent-soft-hover ${className}`}
      >
        <Icon icon="lucide:plus" className="size-[14px]" />
      </button>
      {open && <QuickAddModal project={project} onClose={() => setOpen(false)} />}
    </>
  )
}

function Stat({ icon, title, children }: { icon: string; title: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={title}>
      <Icon icon={icon} aria-hidden="true" className="size-3.5" />
      <span className="tabular-nums">{children}</span>
    </span>
  )
}

/** One result in the list view: icon, name and author, a clamped summary, tags, and the counts on the right. */
export function ProjectListRow({
  project,
  action,
  profileId
}: {
  project: ProjectSummary
  action?: ReactNode
  profileId?: string
}) {
  const { language, t } = useI18n()
  return (
    <li className="group relative flex gap-4 rounded-xl border border-line bg-surface p-3.5 transition-colors duration-[var(--motion-base)] hover:border-[var(--accent-border)] hover:bg-surface-strong focus-within:border-[var(--accent-border)]">
      <Link to={detailPath(project, profileId)} aria-label={project.name} className="absolute inset-0 rounded-xl" />
      <ProjectIcon url={project.iconUrl} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="min-w-0">
          <h3 className="truncate text-[15.5px] leading-tight font-bold" title={project.name}>
            {project.name}
            {project.author && <span className="ml-1.5 text-[13px] font-normal text-subtle">{t('discover.row.by', { author: project.author })}</span>}
          </h3>
          {project.summary && <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-[1.5] text-muted">{project.summary}</p>}
        </div>
        <ProjectTags project={project} limit={LIST_TAGS} />
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2 text-[12.5px] text-subtle">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-3">
            <Stat icon="lucide:download" title={t('discover.stats.downloads')}>
              {formatNumber(project.downloads, language)}
            </Stat>
            {project.follows !== undefined && (
              <Stat icon="lucide:heart" title={t('discover.stats.follows')}>
                {formatNumber(project.follows, language)}
              </Stat>
            )}
          </div>
          {project.updated && (
            <Stat icon="lucide:clock" title={t('discover.stats.updated', { when: formatRelative(project.updated, language) })}>
              {formatRelative(project.updated, language)}
            </Stat>
          )}
        </div>
        {action === undefined ? <QuickAddButton project={project} className="relative" /> : action}
      </div>
    </li>
  )
}

/** One result in the grid view: icon, name, author, a clamped summary, tags and the counts. */
export function ProjectGridCard({
  project,
  action,
  profileId
}: {
  project: ProjectSummary
  action?: ReactNode
  profileId?: string
}) {
  const { language, t } = useI18n()
  return (
    <article className="group relative flex flex-col gap-3 rounded-xl border border-line bg-[var(--card-solid)] p-4 backface-hidden transition-[transform,border-color] duration-[var(--motion-base)] ease-[var(--motion-ease)] hover:translate-y-[var(--motion-lift)] hover:border-[var(--accent-border)] hover:shadow-[inset_0_0_0_9999px_rgba(0,178,255,0.05)] focus-within:border-[var(--accent-border)]">
      <Link to={detailPath(project, profileId)} aria-label={project.name} className="absolute inset-0 rounded-xl" />
      <div className="flex items-start gap-3">
        <ProjectIcon url={project.iconUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] leading-tight font-bold" title={project.name}>
            {project.name}
          </h3>
          {project.author && <p className="truncate text-[12.5px] text-subtle">{t('discover.row.by', { author: project.author })}</p>}
        </div>
      </div>
      {project.summary && <p className="line-clamp-2 text-[13.5px] leading-[1.5] text-muted">{project.summary}</p>}
      <ProjectTags project={project} limit={GRID_TAGS} />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[12.5px] text-subtle">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Stat icon="lucide:download" title={t('discover.stats.downloads')}>
            {formatNumber(project.downloads, language)}
          </Stat>
          {project.follows !== undefined && (
            <Stat icon="lucide:heart" title={t('discover.stats.follows')}>
              {formatNumber(project.follows, language)}
            </Stat>
          )}
        </div>
        {action === undefined ? <QuickAddButton project={project} className="relative" /> : action}
      </div>
    </article>
  )
}

/** The results of one page, as list rows or grid cards. `stale` dims them while the next page loads. */
export function ProjectResults({
  items,
  view,
  stale,
  renderAction,
  profileId
}: {
  items: ProjectSummary[]
  view: DiscoverView
  stale: boolean
  renderAction?: RenderAction
  /** Carried to the project page, so it opens with the same install target. */
  profileId?: string
}) {
  const dim = stale ? 'opacity-50 transition-opacity duration-200' : 'transition-opacity duration-200'
  if (view === 'grid') {
    return (
      <Stagger aria-busy={stale} className={`grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 ${dim}`}>
        {items.map((project) => (
          <ProjectGridCard
            key={`${project.provider}:${project.id}`}
            project={project}
            action={renderAction?.(project)}
            profileId={profileId}
          />
        ))}
      </Stagger>
    )
  }
  return (
    <Stagger as="ul" aria-busy={stale} className={`grid gap-2 ${dim}`}>
      {items.map((project) => (
        <ProjectListRow
          key={`${project.provider}:${project.id}`}
          project={project}
          action={renderAction?.(project)}
          profileId={profileId}
        />
      ))}
    </Stagger>
  )
}
