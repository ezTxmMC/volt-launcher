import { Icon } from '@iconify/react'
import { useI18n, type MessageKey } from '@/i18n'

export type WizardStep = 1 | 2 | 3

const STEPS: readonly WizardStep[] = [1, 2, 3]

const LABELS: Record<WizardStep, MessageKey> = {
  1: 'createProfile.steps.type',
  2: 'createProfile.steps.version',
  3: 'createProfile.steps.finish'
}

/**
 * Numbered steps joined by a connector line. Finished steps show a check mark and can be clicked
 * to go back; the current step is highlighted.
 */
export function StepBar({ current, onSelect }: { current: WizardStep; onSelect: (step: WizardStep) => void }) {
  const { t } = useI18n()
  return (
    <nav aria-label={t('createProfile.steps.aria')}>
      <ol className="flex items-center">
        {STEPS.map((step, index) => {
          const done = step < current
          const active = step === current
          const isLast = index === STEPS.length - 1
          const label = t(LABELS[step])
          const marker = (
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-md border text-[13px] font-bold tabular-nums transition-colors duration-200 ${
                done
                  ? 'border-[var(--accent-border-strong)] bg-accent-soft text-accent'
                  : active
                    ? 'border-[var(--accent-border-strong)] bg-accent text-accent-fg'
                    : 'border-line bg-surface-3 text-subtle'
              }`}
            >
              {done ? <Icon icon="lucide:check" className="size-4" /> : step}
            </span>
          )
          const text = (
            <span
              className={`truncate text-[13px] font-bold tracking-[0.04em] ${
                active ? 'text-fg' : done ? 'text-muted' : 'text-subtle'
              } ${active ? '' : 'hidden sm:inline'}`}
            >
              {label}
            </span>
          )
          return (
            <li
              key={step}
              aria-current={active ? 'step' : undefined}
              className={`flex min-w-0 items-center gap-2 ${isLast ? '' : 'flex-1'}`}
            >
              {done ? (
                <button
                  type="button"
                  onClick={() => onSelect(step)}
                  className="flex min-w-0 items-center gap-2 rounded-md outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  {marker}
                  {text}
                </button>
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  {marker}
                  {text}
                </span>
              )}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`h-px min-w-6 flex-1 transition-colors duration-300 ${done ? 'bg-accent' : 'bg-line'}`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
