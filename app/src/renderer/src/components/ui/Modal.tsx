import { type ReactNode, useCallback, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useI18n } from '@/i18n'
import { leaveThen } from './leave'

/**
 * Modal dialog built on the native <dialog> element (focus trap, Esc and inert background).
 * Look of the old CreateProfileModal: rounded-[14px] panel, accent border, modal shadow.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const { t } = useI18n()
  // Every user-initiated close (button, backdrop, Escape) plays the leave animation first.
  const close = useCallback(() => leaveThen(ref.current, onClose), [onClose])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    // showModal() would focus the close button; prefer the first form control instead.
    dialog.querySelector<HTMLElement>('input, select, textarea')?.focus()
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === ref.current) close()
      }}
      className="volt-dialog m-auto w-[calc(100%-2rem)] rounded-[14px] border border-[var(--accent-border)] bg-surface-strong p-0 text-fg shadow-pop backdrop-blur-xl"
      style={{ maxWidth: wide ? '44rem' : '480px' }}
    >
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-white/7 px-5 py-4">
          <h2 className="text-[16px] font-bold tracking-[0.1em]">{title}</h2>
          <button
            type="button"
            onClick={close}
            aria-label={t('common.close')}
            className="grid size-7 place-items-center rounded-md border border-line bg-surface-3 text-subtle transition-all duration-200 hover:bg-line hover:text-fg"
          >
            <Icon icon="lucide:x" className="size-[14px]" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="mt-1 flex flex-wrap justify-end gap-2 px-5 pb-5">{footer}</footer>}
      </div>
    </dialog>
  )
}
