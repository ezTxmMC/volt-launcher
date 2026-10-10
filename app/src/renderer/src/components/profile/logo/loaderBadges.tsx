import type { ReactNode } from 'react'
import type { Loader } from '@shared/models'
import { LOADER_NAMES } from '@/lib/labels'
import { useState } from 'react'
import fabricLogo from '@/assets/loaders/fabric.png'
import quiltLogo from '@/assets/loaders/quilt.png'
import forgeLogo from '@/assets/loaders/forge.png'
import neoforgeLogo from '@/assets/loaders/neoforge.png'

/*
 * Loader badges. Fabric, Quilt, Forge and NeoForge show their official logo (assets/loaders). Vanilla
 * and any logo that fails to load show a square tile in a brand-like colour with the loader name. They are inline SVG so
 * no image files are needed.
 *
 * To use PNG files instead, put them under app/src/renderer/src/assets/loaders/<loader>.png and
 * return them from LoaderBadgeArt when present. Vite can collect them with
 * import.meta.glob('@/assets/loaders/*.png', { eager: true, import: 'default' }) keyed by file name.
 * Nothing else in the cards has to change.
 */

interface BadgeSpec {
  /** Tile colour. */
  colour: string
  /** Label colour, chosen for contrast on the tile. */
  ink: string
  /** Geometric mark, drawn in the upper part of the 100 x 100 tile. */
  mark: ReactNode
}

const SPECS: Record<Loader, BadgeSpec> = {
  // Grass tone: a 3 x 3 checker of block faces.
  vanilla: {
    colour: '#4caf50',
    ink: '#0d2a10',
    mark: (
      <g>
        {[0, 1, 2].flatMap((row) =>
          [0, 1, 2].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={29 + col * 14}
              y={18 + row * 14}
              width="14"
              height="14"
              fill={(row + col) % 2 === 0 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.22)'}
            />
          ))
        )}
      </g>
    )
  },
  // Beige cloth: a diamond with an inner diamond.
  fabric: {
    colour: '#dbb68d',
    ink: '#3b2412',
    mark: (
      <g>
        <polygon points="50,14 80,38 50,62 20,38" fill="rgba(111,67,30,0.22)" />
        <polygon points="50,24 70,38 50,52 30,38" fill="rgba(255,255,255,0.35)" />
      </g>
    )
  },
  // Purple: four patches in a 2 x 2 grid.
  quilt: {
    colour: '#7f5ab6',
    ink: '#ffffff',
    mark: (
      <g>
        <rect x="31" y="16" width="16" height="16" fill="rgba(255,255,255,0.3)" />
        <rect x="51" y="16" width="16" height="16" fill="rgba(0,0,0,0.15)" />
        <rect x="31" y="36" width="16" height="16" fill="rgba(0,0,0,0.15)" />
        <rect x="51" y="36" width="16" height="16" fill="rgba(255,255,255,0.3)" />
      </g>
    )
  },
  // Blue-grey: a hexagon with a lighter outline.
  forge: {
    colour: '#3c5a8a',
    ink: '#ffffff',
    mark: (
      <polygon
        points="50,14 72,26.5 72,51.5 50,64 28,51.5 28,26.5"
        fill="rgba(255,255,255,0.18)"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="2"
      />
    )
  },
  // Orange: two stacked chevrons.
  neoforge: {
    colour: '#e7812c',
    ink: '#2a1404',
    mark: (
      <g fill="rgba(42,20,4,0.28)">
        <polygon points="50,16 74,40 66,48 50,32 34,48 26,40" />
        <polygon points="50,34 74,58 66,66 50,50 34,66 26,58" />
      </g>
    )
  }
}

/** The official logos (assets/loaders, see LICENSES.md there). Vanilla has none: it comes from the backend. */
export const LOADER_LOGOS: Partial<Record<Loader, string>> = {
  fabric: fabricLogo,
  quilt: quiltLogo,
  forge: forgeLogo,
  neoforge: neoforgeLogo
}

/**
 * The loader badge: the official logo on a light tile where there is one, otherwise the SVG tile
 * with the loader name. A logo that fails to load also falls back to the SVG tile. `label` is the
 * accessible name.
 */
export function LoaderBadgeArt({ loader, label, className }: { loader: Loader; label: string; className?: string }) {
  const [broken, setBroken] = useState(false)
  const logo = LOADER_LOGOS[loader]
  if (logo && !broken) {
    return (
      <div role="img" aria-label={label} className={`flex items-center justify-center rounded-[16px] bg-[#eef1f5] p-3 ${className ?? ''}`}>
        <img src={logo} alt="" draggable={false} onError={() => setBroken(true)} className="h-full w-full object-contain" />
      </div>
    )
  }
  const spec = SPECS[loader]
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={label} className={className}>
      <rect width="100" height="100" rx="16" fill={spec.colour} />
      <rect x="0.75" y="0.75" width="98.5" height="98.5" rx="15.25" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
      {spec.mark}
      <text x="50" y="86" textAnchor="middle" fontSize="14" fontWeight="800" fill={spec.ink}>
        {LOADER_NAMES[loader]}
      </text>
    </svg>
  )
}
