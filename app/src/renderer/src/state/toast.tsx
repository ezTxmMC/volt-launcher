import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/lib/api'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  /** Optional bold line above the message, e.g. "Fehlgeschlagen". */
  title?: string
  message: string
}

interface ToastApi {
  success: (message: string) => void
  info: (message: string) => void
  /** Accepts an Error or any thrown value. */
  error: (error: unknown) => void
  /** A toast with a title. A toast whose kind and message are already on screen is not shown twice. */
  notify: (kind: ToastKind, message: string, title?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const ICONS: Record<ToastKind, string> = {
  success: 'lucide:circle-check',
  error: 'lucide:circle-alert',
  info: 'lucide:info'
}

const TONES: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-info'
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), [])

  const push = useCallback(
    (kind: ToastKind, message: string, title?: string) => {
      const id = nextId.current++
      setItems((current) => {
        if (current.some((item) => item.kind === kind && item.message === message)) return current
        return [...current.slice(-3), { id, kind, title, message }]
      })
      // Also armed for a skipped toast: dismissing an id that is not shown is a no-op.
      setTimeout(() => dismiss(id), kind === 'error' || message.length > 90 ? 8000 : 4500)
    },
    [dismiss]
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      info: (message) => push('info', message),
      error: (error) => push('error', errorMessage(error)),
      notify: (kind, message, title) => push(kind, message, title)
    }),
    [push]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-20 left-4 z-[60] flex flex-col items-end gap-2 md:bottom-4"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border border-line-strong bg-surface-2 py-3 pr-2 pl-4 shadow-pop"
            style={{ animation: 'volt-pop 160ms ease-out' }}
          >
            <Icon icon={ICONS[item.kind]} className={`mt-0.5 size-5 shrink-0 ${TONES[item.kind]}`} />
            <div className="min-w-0 flex-1">
              {item.title && <p className="text-[12px] font-bold tracking-[0.08em] uppercase">{item.title}</p>}
              <p className="text-sm break-words whitespace-pre-line">{item.message}</p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="grid size-6 shrink-0 place-items-center rounded-md text-subtle hover:bg-surface-3 hover:text-fg"
              aria-label={t('common.close')}
            >
              <Icon icon="lucide:x" className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}
