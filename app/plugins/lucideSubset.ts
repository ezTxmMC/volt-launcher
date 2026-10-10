import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

interface IconifyIcon {
  body: string
  width?: number
  height?: number
}
interface IconifyCollection {
  prefix: string
  icons: Record<string, IconifyIcon>
  aliases?: Record<string, { parent: string }>
  width?: number
  height?: number
}

const VIRTUAL_ID = 'virtual:lucide-icons'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry) ? [full] : []
  })
}

/**
 * Builds a subset of the offline Lucide collection containing only the icons referenced as
 * `lucide:<name>` string literals in the renderer sources. Keeps the bundle small while the app
 * still needs no network access for icons.
 */
export function lucideSubset(): Plugin {
  const sourceDir = resolve('src/renderer/src')
  const collectionFile = resolve('node_modules/@iconify-json/lucide/icons.json')

  return {
    name: 'volt-lucide-subset',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load(id) {
      if (id !== RESOLVED_ID) return null
      const used = new Set<string>()
      for (const file of sourceFiles(sourceDir)) {
        for (const match of readFileSync(file, 'utf8').matchAll(/lucide:([a-z0-9-]+)/g)) {
          if (match[1]) used.add(match[1])
        }
      }
      const full = JSON.parse(readFileSync(collectionFile, 'utf8')) as IconifyCollection
      const subset: IconifyCollection = {
        prefix: full.prefix,
        icons: {},
        width: full.width,
        height: full.height
      }
      for (const name of used) {
        const icon = full.icons[name] ?? full.icons[full.aliases?.[name]?.parent ?? '']
        if (icon) subset.icons[name] = icon
        else this.warn(`Unknown Lucide icon: ${name}`)
      }
      return `export default ${JSON.stringify(subset)}`
    }
  }
}
