import { useState } from 'react'
import { Icon } from '@iconify/react'
import type { Loader } from '@shared/models'
import { LOADERS } from '@shared/models'
import { useI18n } from '@/i18n'
import { LOADER_NAMES } from '@/lib/labels'
import { LOADER_LOGOS } from '@/components/profile/logo/loaderBadges'
import { LOADER_META } from './loaders'

/** The light tile behind every loader mark, so the dark logos (Forge's anvil) stay visible. */
const MARK_TILE = 'grid shrink-0 place-items-center bg-[#eef1f5]'

/**
 * The official logo of a loader on the light tile. Vanilla has no logo, so it shows the neutral cube
 * icon on the same tile; a logo that fails to load falls back to that icon too. The name next to the
 * mark is the accessible label, so the mark itself is hidden from assistive tech.
 */
function LoaderMark({ loader, size }: { loader: Loader; size: 'card' | 'chip' }) {
  const [broken, setBroken] = useState(false)
  const logo = LOADER_LOGOS[loader]
  const card = size === 'card'
  const tile = `${MARK_TILE} ${card ? 'size-10 rounded-lg' : 'size-5 rounded-[5px]'}`
  if (!logo || broken) {
    return (
      <span className={`${tile} text-[#3b4350]`} aria-hidden="true">
        <Icon icon={LOADER_META[loader].icon} className={card ? 'size-6' : 'size-3.5'} />
      </span>
    )
  }
  return (
    <span className={tile} aria-hidden="true">
      <img
        src={logo}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
        className={card ? 'size-7 object-contain' : 'size-4 object-contain'}
      />
    </span>
  )
}

/** Step 1: the loader cards. */
export function TypeStep({ loader, onChange }: { loader: Loader; onChange: (loader: Loader) => void }) {
  const { t } = useI18n()
  return (
    <div className="grid min-w-0 gap-4">
      <p className="text-[14px] text-muted">{t('createProfile.type.hint')}</p>
      <div className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 sm:grid-cols-3">
        {LOADERS.map((option) => {
          const meta = LOADER_META[option]
          const selected = option === loader
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={`flex min-w-0 items-start gap-3 rounded-[10px] border p-3.5 text-left transition-all duration-200 ${
                selected
                  ? 'border-[var(--accent-border-strong)] bg-accent-soft shadow-[var(--shadow-accent-md)]'
                  : 'border-line bg-surface-2 hover:border-line-strong hover:bg-surface-3'
              }`}
            >
              <LoaderMark loader={option} size="card" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold text-fg">{LOADER_NAMES[option]}</span>
                  {selected && <Icon icon="lucide:circle-check" className="size-4 shrink-0 text-accent" />}
                </span>
                <span className="mt-1 block text-[12.5px] leading-[1.45] text-subtle">{t(meta.description)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
