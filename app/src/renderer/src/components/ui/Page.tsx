import type { ReactNode } from 'react'

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-4 md:px-6">{children}</div>
}

/** Old pages have no large title; the header keeps the title small and tracked, as the old SettingsPanel heading. */
export function PageHeader({
  title,
  description,
  actions
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="truncate text-[13px] font-bold tracking-[0.12em] text-muted uppercase">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-subtle">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Old SettingsPanel surface: rounded-xl, border-white/10, surface-panel, p-[18px]. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-[18px] ${className}`}>{children}</section>
}
