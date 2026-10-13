import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import type { ContentKind, ProjectSummary, SyncPack, SyncPackEntry, SyncPackKind } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useToast } from '@/state/toast'
import { entryKey } from '@/components/packs/options'
import { DiscoverBrowser } from '@/components/discover/DiscoverBrowser'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

/** What a pack holds: modpacks create their own profile and data packs belong to a world. */
const KINDS: readonly ContentKind[] = ['mod', 'resourcepack', 'shader']

/**
 * Discover scoped to one pack: the same browser as the global page and a profile's tab, but every result
 * is added to the pack instead of being installed. The version is not chosen here: each profile resolves
 * the newest one that fits when the pack is applied. Projects already in the pack show "Im Pack".
 */
export function PackDiscoverTab({ pack, onChanged }: { pack: SyncPack; onChanged: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [entries, setEntries] = useState<SyncPackEntry[]>(pack.entries)
  const [adding, setAdding] = useState<string | null>(null)

  // A reload (or a change from another tab) of the pack replaces the local copy.
  useEffect(() => setEntries(pack.entries), [pack.entries])

  const entryOf = (project: ProjectSummary): SyncPackEntry => ({
    provider: project.provider === 'curseforge' ? 'curseforge' : 'modrinth',
    projectId: project.id,
    kind: project.kind as SyncPackKind,
    name: project.name,
    iconUrl: project.iconUrl
  })

  const add = async (project: ProjectSummary): Promise<void> => {
    const entry = entryOf(project)
    setAdding(entryKey(entry))
    try {
      const saved = await api.syncpacks.update(pack.id, { entries: [...entries, entry] })
      setEntries(saved.entries)
      toast.success(t('syncpacks.content.added', { name: entry.name }))
      onChanged()
    } catch (error) {
      toast.error(error)
    } finally {
      setAdding(null)
    }
  }

  const renderAction = (project: ProjectSummary) => {
    if (project.kind !== 'mod' && project.kind !== 'resourcepack' && project.kind !== 'shader') return null
    const key = entryKey(entryOf(project))
    if (entries.some((existing) => entryKey(existing) === key && existing.kind === project.kind)) {
      return (
        <span className="relative z-10">
          <Badge tone="success" icon="lucide:check">
            {t('syncpacks.picker.added')}
          </Badge>
        </span>
      )
    }
    return (
      <span className="relative z-10">
        <Button
          size="sm"
          variant="primary"
          icon="lucide:package-plus"
          loading={adding === key}
          disabled={adding !== null}
          onClick={() => void add(project)}
        >
          {t('syncpacks.discover.add')}
        </Button>
      </span>
    )
  }

  const scopeBar = () => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13.5px] text-muted">
      <Icon icon="lucide:package-plus" className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
      <span className="min-w-0">{t('syncpacks.discover.info', { pack: pack.name })}</span>
    </div>
  )

  return <DiscoverBrowser kinds={KINDS} renderAction={renderAction} renderScopeBar={scopeBar} />
}
