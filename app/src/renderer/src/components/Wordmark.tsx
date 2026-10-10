import logo from '@/assets/voltlauncher.png'

/** App logo and the "Volt Launcher" wordmark of the top bar. */
export function Wordmark() {
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2.5">
      <img src={logo} alt="" className="size-[26px] shrink-0 rounded-[7px]" />
      <span className="text-[15px] font-bold tracking-[0.02em] whitespace-nowrap">
        <span className="text-accent">Volt</span> Launcher
      </span>
    </div>
  )
}
