import type { Language } from '@shared/models'

/** Compact download counts; German has no short thousand suffix in Intl, so it is spelled out. */
export function formatNumber(value: number, language: Language): string {
  if (language === 'en') {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  }
  const decimal = new Intl.NumberFormat('de', { maximumFractionDigits: 1 })
  if (value >= 1_000_000) return `${decimal.format(value / 1_000_000)} Mio.`
  if (value >= 1_000) return `${decimal.format(value / 1_000)} Tsd.`
  return decimal.format(value)
}

export function formatBytes(bytes: number, language: Language): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const text = new Intl.NumberFormat(language, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)
  return `${text} ${units[unit]}`
}

export function formatDate(iso: string, language: Language): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date)
}

const STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60]
]

export function formatRelative(iso: string, language: Language): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return iso
  const seconds = Math.round((time - Date.now()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return formatter.format(0, 'second')
}

/** Parses an optional positive integer input; empty means "not set". */
export function parseOptionalInt(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isInteger(value) && value > 0 ? value : undefined
}
