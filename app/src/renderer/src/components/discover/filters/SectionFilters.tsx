import { useState } from 'react'
import { Icon } from '@iconify/react'
import type { FilterOption } from '@shared/models'
import { useI18n } from '@/i18n'
import { Checkbox } from '@/components/ui/Checkbox'
import { Switch } from '@/components/ui/Switch'
import { categoryIcon, categoryLabel, loaderChoices, loaderColor, loaderIcon, loaderLabel } from './model'

/** Loaders shown before "Show more". */
const LOADER_PREVIEW = 5

interface LoaderFilterProps {
  loaders: readonly string[]
  /** The one loader the search is limited to ('' for any). The backend takes a single loader. */
  value: string
  onChange: (loader: string) => void
}

export function LoaderFilter({ loaders, value, onChange }: LoaderFilterProps) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const choices = loaderChoices(loaders)
  let visible = expanded ? choices : choices.slice(0, LOADER_PREVIEW)
  if (value && !visible.includes(value)) visible = [...visible, value]

  return (
    <div role="group" aria-label={t('discover.section.loader')} className="grid gap-0.5">
      {visible.map((id) => (
        <Checkbox
          key={id}
          checked={value === id}
          onChange={(checked) => onChange(checked ? id : '')}
          label={loaderLabel(id)}
          icon={<Icon icon={loaderIcon(id)} aria-hidden="true" className="size-[14px]" style={{ color: loaderColor(id) }} />}
          className="rounded-md px-1.5 py-1 text-[14px] hover:bg-white/[0.05]"
        />
      ))}
      {choices.length > LOADER_PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="justify-self-start rounded-md px-1.5 py-1 text-[13px] text-accent hover:underline"
        >
          {expanded ? t('discover.loader.less') : t('discover.loader.more')}
        </button>
      )}
    </div>
  )
}

interface CategoryFilterProps {
  categories: readonly FilterOption[]
  selected: readonly string[]
  onChange: (selected: string[]) => void
}

/** Categories narrow together: every checked one must match, as the backend applies them. */
export function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
  const { t } = useI18n()
  return (
    <div role="group" aria-label={t('discover.section.category')} className="grid gap-0.5">
      {categories.map((category) => {
        const checked = selected.includes(category.id)
        return (
          <Checkbox
            key={category.id}
            checked={checked}
            onChange={(next) =>
              onChange(next ? [...selected, category.id] : selected.filter((candidate) => candidate !== category.id))
            }
            label={categoryLabel(category)}
            icon={<Icon icon={categoryIcon(category.id)} aria-hidden="true" className="size-[14px]" />}
            className="rounded-md px-1.5 py-1 text-[14px] hover:bg-white/[0.05]"
          />
        )
      })}
    </div>
  )
}

interface EnvironmentFilterProps {
  /** Subset of ['client', 'server']. */
  selected: readonly string[]
  onChange: (selected: string[]) => void
}

/** Client and server support. Both checked keeps mods that support both sides, as each side is its own filter. */
export function EnvironmentFilter({ selected, onChange }: EnvironmentFilterProps) {
  const { t } = useI18n()
  const sides: Array<{ id: 'client' | 'server'; icon: string; label: string }> = [
    { id: 'client', icon: 'lucide:monitor', label: t('discover.environment.client') },
    { id: 'server', icon: 'lucide:server', label: t('discover.environment.server') }
  ]
  return (
    <div role="group" aria-label={t('discover.section.environment')} className="grid gap-0.5">
      {sides.map((side) => {
        const checked = selected.includes(side.id)
        return (
          <Checkbox
            key={side.id}
            checked={checked}
            onChange={(next) =>
              onChange(next ? [...selected, side.id] : selected.filter((candidate) => candidate !== side.id))
            }
            label={side.label}
            icon={<Icon icon={side.icon} aria-hidden="true" className="size-[14px]" />}
            className="rounded-md px-1.5 py-1 text-[14px] hover:bg-white/[0.05]"
          />
        )
      })}
    </div>
  )
}

interface LicenseFilterProps {
  openSource: boolean
  onChange: (openSource: boolean) => void
}

export function LicenseFilter({ openSource, onChange }: LicenseFilterProps) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-between gap-3 px-1.5 py-1">
      <span className="text-[14px] text-fg/80">{t('discover.license.openSource')}</span>
      <Switch checked={openSource} onChange={onChange} label={t('discover.license.openSource')} />
    </div>
  )
}
