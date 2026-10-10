import type { ReactNode } from 'react'
import { Icon } from '@iconify/react'
import type { ServerInfo } from '@shared/models'
import { useI18n } from '@/i18n'
import { useSettings } from '@/state/settings'

export const QUICK_PLAY_LIMIT = 5

interface QuickPlayStripProps {
  /** Servers of the selected profile; only the first QUICK_PLAY_LIMIT are shown. */
  servers: readonly ServerInfo[]
  loading: boolean
  error: string | null
  disabled: boolean
  /** Starts the selected profile and joins the given server. */
  onLaunch: (server: ServerInfo) => void
}

/** Full-width strip under the launch panel: the label, then the profile's servers as quick entries. */
export function QuickPlayStrip({ servers, loading, error, disabled, onLaunch }: QuickPlayStripProps) {
  const { t } = useI18n()
  const { settings } = useSettings()
  const shown = servers.slice(0, QUICK_PLAY_LIMIT)

  let body: ReactNode
  if (error) {
    body = <span className="text-[13px] text-subtle">{t('home.quickPlay.failed')}</span>
  } else if (shown.length === 0) {
    body = !loading && <span className="text-[13px] text-subtle">{t('home.quickPlay.empty')}</span>
  } else {
    body = (
      <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {shown.map((server) => (
          <li key={server.index} className="min-w-0 max-w-full">
            <button
              type="button"
              title={t('quickPlay.joinTitle', { address: server.address })}
              disabled={disabled}
              onClick={() => onLaunch(server)}
              className="flex max-w-[240px] items-center gap-2 rounded-lg border border-line bg-surface-3 px-2.5 py-1.5 text-[13.5px] font-semibold text-muted transition-colors hover:bg-line hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {server.icon ? (
                <img src={server.icon} alt="" className="size-4 shrink-0 rounded-sm [image-rendering:pixelated]" />
              ) : (
                <Icon icon="lucide:server" className="size-4 shrink-0 text-subtle" />
              )}
              <span className="truncate">{settings.quickJoinLabel === 'address' ? server.address : server.name || server.address}</span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section
      aria-label={t('home.quickPlay')}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2.5"
    >
      <h3 className="shrink-0 text-[12px] font-bold tracking-[0.16em] text-accent uppercase">{t('home.quickPlay')}</h3>
      {body}
    </section>
  )
}
