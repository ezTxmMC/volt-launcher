import type { VersionCategory } from './versions'

/*
 * Tile art for the version step. Every category gets one pixel scene: a 16 x 12 grid of generic
 * blocks (grass, stone, dirt and so on, drawn here as flat shapes) whose heights come from a seeded
 * random walk. The seed is derived from the category name, so a category always looks the same.
 * Each scene is one SVG string, built once and cached. No artwork is copied.
 */

/** One block: its face colour, a lighter top edge and a darker bottom edge. */
interface Block {
  face: string
  light: string
  dark: string
}

interface Palette {
  /** Sky gradient, top to bottom. */
  skyTop: string
  skyBottom: string
  /** Blocks that cap a column. */
  surface: Block[]
  /** Blocks under the cap (the three layers below the surface excepted). */
  sub: Block[]
  /** Blocks at the bottom of a column. */
  deep: Block[]
  /** Colour of the single pixels (flowers, glints, stars) in the sky. */
  accent: string
  /** Striped amber overlay (snapshots). */
  stripes: boolean
}

const grass: Block = { face: '#6cc24a', light: '#9be36d', dark: '#3f8a2b' }
const water: Block = { face: '#3d9cf0', light: '#7cc4ff', dark: '#2269b8' }
const dirt: Block = { face: '#8a5a33', light: '#a57046', dark: '#5e3b20' }
const stone: Block = { face: '#7d8590', light: '#a2aab4', dark: '#50565f' }

const PALETTES: Record<VersionCategory, Palette> = {
  // 26.x: cyan crystal and violet amethyst on deep indigo.
  year: {
    skyTop: '#2b1b63',
    skyBottom: '#0c4a5e',
    surface: [
      { face: '#35e0ff', light: '#b8f6ff', dark: '#0c8fb0' },
      { face: '#7ff3ff', light: '#e4fdff', dark: '#2fb3cf' }
    ],
    sub: [
      { face: '#8b5cf6', light: '#c4b0ff', dark: '#4c2aa6' },
      { face: '#5b3fb5', light: '#8f74e0', dark: '#33207a' }
    ],
    deep: [{ face: '#2a2d52', light: '#3e4378', dark: '#15172e' }],
    accent: '#e9fdff',
    stripes: false
  },
  // 1.21: fresh grass and sky blue, with water.
  v1_21: {
    skyTop: '#7fd3ff',
    skyBottom: '#3a8fe0',
    surface: [grass, grass, water],
    sub: [dirt, { face: '#9a6a3c', light: '#b98654', dark: '#6b4224' }],
    deep: [stone],
    accent: '#ffd23f',
    stripes: false
  },
  // 1.20: cherry pink leaves and amber sand over wood.
  v1_20: {
    skyTop: '#ffd1e0',
    skyBottom: '#ffb37a',
    surface: [
      { face: '#f48fb1', light: '#ffc4d6', dark: '#c25d86' },
      { face: '#f2b33d', light: '#ffd77a', dark: '#c8861c' }
    ],
    sub: [{ face: '#9a5f38', light: '#b57b4f', dark: '#6b3f22' }],
    deep: [{ face: '#c18a4f', light: '#d9a771', dark: '#7e5c33' }],
    accent: '#fff4f8',
    stripes: false
  },
  // 1.19: deep teal prismarine, sculk and dark deepslate.
  v1_19: {
    skyTop: '#0f3d45',
    skyBottom: '#05161b',
    surface: [
      { face: '#2a9d8f', light: '#5fc7b8', dark: '#17675f' },
      { face: '#0c3640', light: '#1d5b68', dark: '#061e25' }
    ],
    sub: [{ face: '#26343a', light: '#3b4f57', dark: '#141f23' }],
    deep: [{ face: '#1a2428', light: '#2a3a40', dark: '#0d1316' }],
    accent: '#3ef0e0',
    stripes: false
  },
  // 1.18: calcite and amethyst over stone and tuff, in grey.
  v1_18: {
    skyTop: '#a7afbd',
    skyBottom: '#5f6777',
    surface: [
      { face: '#e3e7ee', light: '#f7f9fc', dark: '#b5bdc9' },
      { face: '#a86ee8', light: '#d1a9ff', dark: '#7344b5' }
    ],
    sub: [{ face: '#8a9099', light: '#a7adb6', dark: '#666c75' }],
    deep: [{ face: '#5d636c', light: '#7a808a', dark: '#41464e' }],
    accent: '#cfa3ff',
    stripes: false
  },
  // 1.17: lush greens of moss, leaves and dripleaf over mud.
  v1_17: {
    skyTop: '#9fe3a0',
    skyBottom: '#3f9e6a',
    surface: [
      { face: '#7bbd3f', light: '#a6dc62', dark: '#4f8a25' },
      { face: '#2f8f3d', light: '#4fb35a', dark: '#1d6129' },
      { face: '#5fae55', light: '#8ad37e', dark: '#3a7f35' }
    ],
    sub: [{ face: '#6a5440', light: '#84705a', dark: '#4d3b2c' }],
    deep: [{ face: '#4d3b2c', light: '#6a5440', dark: '#33271c' }],
    accent: '#c7f59a',
    stripes: false
  },
  // 1.16: nether red and near-black brick.
  v1_16: {
    skyTop: '#3a0a0a',
    skyBottom: '#120305',
    surface: [
      { face: '#8f2f2a', light: '#b8483f', dark: '#5e1a17' },
      { face: '#b0303a', light: '#d65a64', dark: '#7a1f28' }
    ],
    sub: [{ face: '#3d1418', light: '#5a232a', dark: '#220a0d' }],
    deep: [{ face: '#2b2326', light: '#413639', dark: '#161012' }],
    accent: '#ffb14a',
    stripes: false
  },
  // Older releases: earthy brown dirt, grass, planks and cobble.
  older: {
    skyTop: '#d9c7a0',
    skyBottom: '#a8895a',
    surface: [grass],
    sub: [dirt, { face: '#b08650', light: '#c9a06c', dark: '#7e5c33' }],
    deep: [{ face: '#7c7c74', light: '#9a9a92', dark: '#55554f' }],
    accent: '#f3e7bf',
    stripes: false
  },
  // Snapshots: neutral sand and stone under an amber striped overlay.
  snapshot: {
    skyTop: '#2a2d33',
    skyBottom: '#15171b',
    surface: [{ face: '#d8c08a', light: '#ecd9ab', dark: '#b09860' }],
    sub: [{ face: '#7a7f88', light: '#9aa0a9', dark: '#5d626b' }],
    deep: [{ face: '#5c6068', light: '#767b84', dark: '#44484f' }],
    accent: '#ffe9a8',
    stripes: true
  }
}

const COLS = 16
const ROWS = 12
const MIN_HEIGHT = 2
const MAX_HEIGHT = 7

/** Darkens the top of the tile for the big number; the bottom gets the most shade. */
const OVERLAY = 'linear-gradient(180deg, rgb(8 10 20 / 0.3) 0%, rgb(8 10 20 / 0.1) 45%, rgb(8 10 20 / 0.62) 100%)'

/** FNV-1a: a stable 32-bit seed from a category name. */
function hashString(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** mulberry32: a small seeded generator, so the same seed always gives the same scene. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T
}

/** Rounds to two decimals so the SVG string stays short. */
function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function cube(x: number, y: number, block: Block, random: () => number): string {
  let out =
    `<rect x="${x}" y="${y}" width="1" height="1" fill="${block.face}"/>` +
    `<rect x="${x}" y="${y}" width="1" height="0.2" fill="${block.light}"/>` +
    `<rect x="${x}" y="${num(y + 0.86)}" width="1" height="0.14" fill="${block.dark}"/>`
  if (random() < 0.22) {
    out += `<rect x="${num(x + 0.2 + random() * 0.5)}" y="${num(y + 0.3 + random() * 0.4)}" width="0.3" height="0.3" fill="${block.dark}"/>`
  }
  return out
}

function buildScene(category: VersionCategory): string {
  const palette = PALETTES[category]
  const random = seededRandom(hashString(category))

  // Column heights: a random walk, kept between MIN_HEIGHT and MAX_HEIGHT blocks.
  const heights: number[] = []
  let height = 4
  for (let x = 0; x < COLS; x++) {
    const step = [-1, 0, 0, 1][Math.floor(random() * 4)] ?? 0
    height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height + step))
    heights.push(height)
  }

  const parts: string[] = []
  for (let x = 0; x < COLS; x++) {
    const count = heights[x] ?? MIN_HEIGHT
    const top = ROWS - count
    // Sky above the column: a few single pixels (stars or flowers).
    for (let y = 0; y < top; y++) {
      if (random() < 0.05) parts.push(`<rect x="${x + 0.3}" y="${y + 0.3}" width="0.4" height="0.4" fill="${palette.accent}"/>`)
    }
    if (top > 0 && random() < 0.16) {
      parts.push(`<rect x="${x + 0.25}" y="${top - 1 + 0.25}" width="0.5" height="0.5" fill="${palette.accent}"/>`)
    }
    for (let k = 0; k < count; k++) {
      const y = ROWS - 1 - k
      const block =
        k === count - 1 ? pick(random, palette.surface) : k < count - 3 ? pick(random, palette.deep) : pick(random, palette.sub)
      parts.push(cube(x, y, block, random))
    }
  }

  if (palette.stripes) {
    // Diagonal amber bands, one per two cells.
    for (let k = -ROWS; k < COLS; k += 2) {
      parts.push(`<path d="M${k} 0h1l${ROWS} ${ROWS}h-1z" fill="#ffb020" fill-opacity="0.34"/>`)
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLS} ${ROWS}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="${palette.skyTop}"/>` +
    `<stop offset="1" stop-color="${palette.skyBottom}"/></linearGradient></defs>` +
    `<rect width="${COLS}" height="${ROWS}" fill="url(#s)"/>` +
    `<g shape-rendering="crispEdges">${parts.join('')}</g></svg>`
  )
}

const artCache = new Map<VersionCategory, string>()

/**
 * The CSS background-image of a version tile: the dark overlay over the category's pixel scene.
 * One SVG per category, built on first use and then reused.
 */
export function categoryArt(category: VersionCategory): string {
  let value = artCache.get(category)
  if (value === undefined) {
    value = `${OVERLAY}, url("data:image/svg+xml,${encodeURIComponent(buildScene(category))}")`
    artCache.set(category, value)
  }
  return value
}

/** A small square in the category colours (list view). */
export function categorySwatch(category: VersionCategory): string {
  const palette = PALETTES[category]
  const face = palette.surface[0]?.face ?? palette.accent
  const deep = palette.deep[0]?.face ?? palette.skyBottom
  return `linear-gradient(135deg, ${palette.skyTop} 0%, ${face} 55%, ${deep} 100%)`
}
