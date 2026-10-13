import { useI18n } from '@/i18n'
import { useGames } from '@/state/games'
import { RunningGameRow } from './RunningGameRow'
import { StopAllButton } from './StopAllButton'

/** "Läuft gerade": the running profiles at the top of the profiles page, with the same rows as the top-bar panel. */
export function RunningStrip() {
  const { t } = useI18n()
  const { entries } = useGames()
  if (entries.length === 0) return null
  const hasRunning = entries.some((entry) => entry.state !== 'launching')
  return (
    <section aria-label={t('games.strip')} className="grid gap-1 rounded-xl border border-success/25 bg-success-soft px-3 py-2.5">
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-[12px] font-bold tracking-[0.14em] text-success uppercase">
          {t('games.strip')}
          <span className="rounded-full bg-success-soft px-1.5 text-[11px] leading-5 tracking-normal text-success">{entries.length}</span>
        </h3>
        {hasRunning && (
          <span className="ml-auto">
            <StopAllButton />
          </span>
        )}
      </div>
      <div className="grid gap-x-6 lg:grid-cols-2">
        {entries.map((entry) => (
          <RunningGameRow key={entry.profileId} entry={entry} compact />
        ))}
      </div>
    </section>
  )
}
