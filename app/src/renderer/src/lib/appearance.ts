import type { Settings, UiScale } from '@shared/models'

/**
 * Presentation settings (accent colour, UI scale, animations) applied to the document.
 *
 * The accent is written as CSS custom properties on the root element, so every token derived
 * from it in styles.css follows. The default blue removes the overrides again, so the light and
 * dark themes keep their own accent.
 */

export const DEFAULT_ACCENT = '#00b2ff'

/** The ten accent colours of the old Vue settings. */
export const ACCENT_COLORS: readonly string[] = [
  '#00b2ff',
  '#6c63ff',
  '#8b5cf6',
  '#ec4899',
  '#10b981',
  '#00ffcc',
  '#f59e0b',
  '#ef4444',
  '#f97316',
  '#64748b'
]

/** Old UI scale factors, applied to the whole interface through CSS zoom. */
const UI_SCALE_FACTORS: Record<UiScale, number> = { compact: 0.9, default: 1, comfortable: 1.12 }

const STYLE_ID = 'volt-appearance'

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function rgbOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Mixes the colour with white (amount > 0) or black (amount < 0), as a hex string. */
function shade(hex: string, amount: number): string {
  const [r, g, b] = rgbOf(hex)
  const target = amount >= 0 ? 255 : 0
  const mix = (channel: number): string =>
    Math.round(channel + (target - channel) * Math.abs(amount))
      .toString(16)
      .padStart(2, '0')
  return `#${mix(r)}${mix(g)}${mix(b)}`
}

/** Every accent-derived token of styles.css, with the alpha values of the dark theme. */
function accentTokens(hex: string): Record<string, string> {
  const [r, g, b] = rgbOf(hex)
  const rgb = `${r}, ${g}, ${b}`
  return {
    '--accent': hex,
    '--accent-rgb': rgb,
    '--accent-hover': shade(hex, 0.12),
    '--accent-soft': `rgba(${rgb}, 0.1)`,
    '--accent-soft-hover': `rgba(${rgb}, 0.2)`,
    '--accent-soft-strong': `rgba(${rgb}, 0.12)`,
    '--accent-line': `rgba(${rgb}, 0.28)`,
    '--accent-border': `rgba(${rgb}, 0.2)`,
    '--accent-border-strong': `rgba(${rgb}, 0.25)`,
    '--accent-border-active': `rgba(${rgb}, 0.45)`,
    '--accent-focus': `rgba(${rgb}, 0.4)`
  }
}

const ANIMATION_RULES = `
:root[data-no-animations] *,
:root[data-no-animations] *::before,
:root[data-no-animations] *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}`

/** Injected once, so the animation switch needs no change to the stylesheet file. */
function ensureStyleElement(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = ANIMATION_RULES
  document.head.appendChild(style)
}

export function applyAppearance(settings: Pick<Settings, 'accentColor' | 'uiScale' | 'animationsEnabled'>): void {
  const root = document.documentElement
  ensureStyleElement()

  const accent = isHexColor(settings.accentColor) ? settings.accentColor.toLowerCase() : DEFAULT_ACCENT
  const tokens = accent === DEFAULT_ACCENT ? {} : accentTokens(accent)
  for (const name of Object.keys(accentTokens(DEFAULT_ACCENT))) {
    const value = tokens[name]
    if (value) root.style.setProperty(name, value)
    else root.style.removeProperty(name)
  }

  const scale = UI_SCALE_FACTORS[settings.uiScale] ?? 1
  root.style.zoom = scale === 1 ? '' : String(scale)

  root.toggleAttribute('data-no-animations', !settings.animationsEnabled)
}
