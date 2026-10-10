import { useId, useState, type ReactNode } from 'react'
import { Icon } from '@iconify/react'

/** One collapsible block of the filter sidebar: a header with a chevron, and the controls when open. */
export function FilterSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  return (
    <section className="rounded-xl border border-line bg-surface">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left text-[14px] font-bold text-fg transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-accent/40 outline-none"
        >
          <span>{title}</span>
          <Icon icon={open ? 'lucide:chevron-up' : 'lucide:chevron-down'} aria-hidden="true" className="size-4 shrink-0 text-subtle" />
        </button>
      </h3>
      {open && (
        <div id={panelId} className="grid gap-2 px-3.5 pb-3.5">
          {children}
        </div>
      )}
    </section>
  )
}
