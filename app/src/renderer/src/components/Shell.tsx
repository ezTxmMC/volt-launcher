import { Icon } from '@iconify/react'
import { NavLink, Outlet } from 'react-router'
import { useI18n } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { AuroraBackground } from './AuroraBackground'
import { JobsButton } from './JobsPanel'
import { Wordmark } from './Wordmark'
import { WindowControls } from './WindowControls'
import { AccountMenu } from './accounts/AccountMenu'
import { PageTransition } from './motion/PageTransition'

interface RailItem {
  to: string
  label: MessageKey
  icon: string
}

/** Left rail. The main items sit at the top; News and Settings sit at the bottom. Chat and Clips are not offered yet (no backend). */
const RAIL_TOP: readonly RailItem[] = [
  { to: '/', label: 'rail.play', icon: 'lucide:gamepad-2' },
  { to: '/profiles', label: 'rail.instances', icon: 'lucide:layers' },
  { to: '/discover', label: 'rail.discover', icon: 'lucide:search' },
  { to: '/skins', label: 'rail.character', icon: 'lucide:user-round' }
]

const RAIL_BOTTOM: readonly RailItem[] = [
  { to: '/news', label: 'rail.news', icon: 'lucide:newspaper' },
  { to: '/settings', label: 'rail.settings', icon: 'lucide:settings' }
]

function Rail() {
  const { t } = useI18n()
  const renderItem = (item: RailItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === '/'}
      title={t(item.label)}
      className={({ isActive }) =>
        `flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-center text-[11.5px] leading-tight font-semibold transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-base)] ease-[var(--motion-ease)] ${
          isActive
            ? 'border-[var(--accent-border)] bg-accent-soft text-fg shadow-[var(--shadow-accent-md)]'
            : 'border-transparent text-muted hover:bg-white/5 hover:text-fg'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon icon={item.icon} className={`size-[20px] ${isActive ? 'text-accent' : ''}`} />
          <span>{t(item.label)}</span>
        </>
      )}
    </NavLink>
  )
  return (
    <nav aria-label={t('nav.main')} className="flex w-[92px] shrink-0 flex-col gap-1.5 py-2">
      {RAIL_TOP.map(renderItem)}
      <div className="mt-auto flex flex-col gap-1.5">{RAIL_BOTTOM.map(renderItem)}</div>
    </nav>
  )
}

/**
 * Top bar: wordmark on the left; on the right the activity bell, the account chip
 * and the window buttons. The bar is the window's drag region, so every control is no-drag.
 */
function TopBar() {
  return (
    <header className="app-drag relative z-[60] flex h-[52px] shrink-0 items-center gap-3 pr-2 pl-4">
      <Wordmark />
      <div className="app-no-drag ml-auto flex min-w-0 shrink-0 items-center gap-2">
        <JobsButton />
        <AccountMenu />
        <WindowControls />
      </div>
    </header>
  )
}

/** App shell: top bar, left rail and the content as one large rounded panel. */
export function Shell() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg text-fg antialiased">
      <AuroraBackground />
      <TopBar />
      <div className="relative z-10 flex min-h-0 flex-1 gap-2 px-2 pb-2">
        <Rail />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-2xl border border-line bg-surface shadow-pop">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  )
}
