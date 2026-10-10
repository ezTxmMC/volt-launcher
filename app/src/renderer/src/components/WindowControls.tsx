import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { useI18n } from '@/i18n'

/**
 * Minimise, maximise (or restore) and close for the frameless window. Rendered inside a drag region's
 * no-drag wrapper; without the Electron bridge (plain browser dev) the buttons do nothing.
 */
export function WindowControls() {
  const { t } = useI18n()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const bridge = window.volt
    if (!bridge) return
    let active = true
    void bridge.isMaximized().then((value) => {
      if (active) setMaximized(value)
    })
    const unsubscribe = bridge.onMaximizedChange((value) => {
      if (active) setMaximized(value)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const button = 'grid h-8 w-9 place-items-center rounded-[7px] border border-line bg-surface-3 text-muted transition-all duration-200 hover:bg-line hover:text-fg'

  return (
    <div className="app-no-drag flex shrink-0 items-center gap-1.5">
      <button type="button" className={button} aria-label={t('window.minimize')} title={t('window.minimize')} onClick={() => void window.volt?.minimize()}>
        <Icon icon="lucide:minus" className="size-[15px]" />
      </button>
      <button
        type="button"
        className={button}
        aria-label={maximized ? t('window.restore') : t('window.maximize')}
        title={maximized ? t('window.restore') : t('window.maximize')}
        onClick={() => void window.volt?.maximize()}
      >
        <Icon icon={maximized ? 'lucide:copy' : 'lucide:square'} className="size-[13px]" />
      </button>
      <button
        type="button"
        className={`${button} hover:border-danger/40 hover:bg-danger hover:text-white`}
        aria-label={t('window.close')}
        title={t('window.close')}
        onClick={() => void window.volt?.close()}
      >
        <Icon icon="lucide:x" className="size-[15px]" />
      </button>
    </div>
  )
}
