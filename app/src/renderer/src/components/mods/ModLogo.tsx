import { useState } from 'react'
import { Icon } from '@iconify/react'
import type { ProviderId } from '@shared/models'
import { useProjectIcon } from './useProjectIcon'

/**
 * A mod's project icon as a 32 px rounded tile, placed before the name. A neutral puzzle tile stands in
 * while the icon loads, when the project has none, and when the image fails (no broken-image icon).
 * The image is decorative, since the name next to it says what the mod is, so it has an empty alt.
 */
export function ModLogo({ provider, projectId }: { provider?: ProviderId | null; projectId?: string | null }) {
  const url = useProjectIcon(provider, projectId)
  const [outcome, setOutcome] = useState<{ url: string; ok: boolean } | null>(null)
  const loaded = url !== null && outcome?.url === url && outcome.ok
  const failed = url !== null && outcome?.url === url && !outcome.ok

  return (
    <span
      aria-hidden="true"
      className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-white/5 text-fg/30"
    >
      {url !== null && !failed && (
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setOutcome({ url, ok: true })}
          onError={() => setOutcome({ url, ok: false })}
          className={`absolute inset-0 size-full object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {!loaded && <Icon icon="lucide:puzzle" className="size-4" />}
    </span>
  )
}
