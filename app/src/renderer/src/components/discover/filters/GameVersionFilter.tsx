import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useI18n } from '@/i18n'
import { Checkbox } from '@/components/ui/Checkbox'
import { Switch } from '@/components/ui/Switch'
import { DebouncedInput } from './DebouncedInput'

/** Versions shown before "Show all versions" is switched on (the list is newest first). */
const PREVIEW_COUNT = 10

interface GameVersionFilterProps {
  /** Versions the provider lists, newest first. Empty: the provider lists none, so a text field is shown. */
  versions: readonly string[]
  /** The one version the search is limited to ('' for any). The backend takes a single game version. */
  value: string
  onChange: (version: string) => void
}

/**
 * Game version list: a search field over the list, one checkbox per version, and a switch that
 * shows the full list. Checking a version replaces the previous choice (the backend takes one).
 */
export function GameVersionFilter({ versions, value, onChange }: GameVersionFilterProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  if (versions.length === 0) {
    return (
      <DebouncedInput
        ariaLabel={t('discover.section.gameVersion')}
        placeholder={t('discover.version.free')}
        value={value}
        onCommit={onChange}
      />
    )
  }

  const needle = query.trim().toLowerCase()
  const matching = needle ? versions.filter((version) => version.toLowerCase().includes(needle)) : versions
  let visible = needle || showAll ? matching : matching.slice(0, PREVIEW_COUNT)
  // The chosen version stays in the list even when it is outside the preview.
  if (value && !needle && !visible.includes(value)) visible = [value, ...visible]

  return (
    <>
      <div className="relative">
        <Icon icon="lucide:search" aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-[13px] -translate-y-1/2 text-subtle" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('discover.version.search')}
          aria-label={t('discover.version.search')}
          className="h-8 w-full rounded-md border border-line bg-surface-input pr-2.5 pl-8 text-[13.5px] text-fg outline-none placeholder:text-subtle focus:border-[var(--accent-focus)]"
        />
      </div>
      <div role="group" aria-label={t('discover.section.gameVersion')} className="grid max-h-56 gap-0.5 overflow-y-auto pr-1">
        {visible.map((version) => (
          <Checkbox
            key={version}
            checked={value === version}
            onChange={(checked) => onChange(checked ? version : '')}
            label={version}
            className="rounded-md px-1.5 py-1 text-[14px] hover:bg-white/[0.05]"
          />
        ))}
        {visible.length === 0 && <p className="px-1.5 py-1 text-[13px] text-subtle">{t('discover.version.none')}</p>}
      </div>
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <span className="text-[13.5px] text-muted">{t('discover.version.showAll')}</span>
        <Switch checked={showAll} onChange={setShowAll} label={t('discover.version.showAll')} />
      </div>
    </>
  )
}
