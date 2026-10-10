/** Decorative glow behind the content, as the old AuroraBackground. */
export function AuroraBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -top-44 -left-20 h-[700px] w-[700px] animate-pulse rounded-full bg-[image:var(--aurora-primary)] blur-[120px]" />
      <div className="absolute top-[35%] right-[-130px] h-[580px] w-[580px] animate-pulse rounded-full bg-[image:var(--aurora-secondary)] blur-[120px] [animation-delay:-1s]" />
      <div className="absolute bottom-[-80px] left-[28%] h-[480px] w-[480px] animate-pulse rounded-full bg-[image:var(--aurora-violet)] blur-[120px] [animation-delay:-2s]" />
      <div className="absolute top-[40%] left-[45%] h-[320px] w-[320px] animate-pulse rounded-full bg-[image:var(--aurora-accent)] blur-[120px] [animation-delay:-3s]" />
    </div>
  )
}
