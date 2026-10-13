import { useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { useI18n } from '@/i18n'
import { useGames } from '@/state/games'
import { RunningGameRow } from './RunningGameRow'
import { StopAllButton } from './StopAllButton'

/** Top-bar button next to the activity bell: count badge of the running games and a panel to manage them. */
export function GamesButton() {
  const { t } = useI18n()
  const { entries, count, panelOpen: open, setPanelOpen: setOpen } = useGames()
  const container = useRef<HTMLDivElement>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent): void => {
      if (confirming) return
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !confirming) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, confirming, setOpen])

  const label = t('games.title')
  const hasRunning = entries.some((entry) => entry.state !== 'launching')
  // Nothing runs: the button disappears (an open panel closes with it).
  if (count === 0 && !open) return null

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
        aria-label={count > 0 ? `${label}: ${count}` : label}
        className="relative grid size-8 place-items-center rounded-full border border-line bg-surface-3 text-subtle transition-all duration-200 hover:bg-line hover:text-fg"
      >
        <Icon icon="lucide:gamepad-2" className={`size-[15px] ${count > 0 ? 'text-success' : ''}`} />
        {count > 0 && (
          <span className="absolute -top-[3px] -right-[3px] flex size-4 items-center justify-center rounded-full bg-success text-[9px] leading-none font-bold text-bg">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label={label}
          className="app-no-drag fixed inset-x-3 top-14 z-40 flex max-h-[70vh] flex-col overflow-hidden rounded-lg border border-white/10 bg-header shadow-pop backdrop-blur-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[440px] sm:origin-top-right"
        >
          <header className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2.5">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold">{label}</h2>
              {count > 0 && <p className="text-[11px] text-success">{t('games.count', { n: count })}</p>}
            </div>
          </header>
          <div className="max-h-[320px] overflow-y-auto px-3">
            {entries.length === 0 ? (
              <p className="px-2 py-6 text-center text-[15px] text-fg/30">{t('games.empty')}</p>
            ) : (
              entries.map((entry) => (
                <RunningGameRow key={entry.profileId} entry={entry} onNavigate={() => setOpen(false)} />
              ))
            )}
          </div>
          {hasRunning && (
            <footer className="flex justify-end border-t border-white/5 px-3 py-2">
              <StopAllButton onDialogChange={setConfirming} />
            </footer>
          )}
        </section>
      )}
    </div>
  )
}
