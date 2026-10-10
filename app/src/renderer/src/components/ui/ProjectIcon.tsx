import { useState } from 'react'
import { Icon } from '@iconify/react'

/** Remote project icon with a neutral fallback when missing or failing to load. */
export function ProjectIcon({ url, size = 'md' }: { url: string | null; size?: 'md' | 'lg' }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const dimension = size === 'lg' ? 'size-16' : 'size-12'
  if (url && failedUrl !== url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(url)}
        className={`${dimension} shrink-0 rounded-lg bg-white/5 object-cover ${size === 'lg' ? 'rounded-xl' : ''}`}
      />
    )
  }
  return (
    <span className={`${dimension} grid shrink-0 place-items-center rounded-lg bg-white/5 text-fg/30 ${size === 'lg' ? 'rounded-xl' : ''}`}>
      <Icon icon="lucide:package" className={size === 'lg' ? 'size-8' : 'size-6'} />
    </span>
  )
}
