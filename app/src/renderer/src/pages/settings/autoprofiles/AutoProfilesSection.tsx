import { AutoProfileStatusCard } from './AutoProfileStatusCard'
import { AutoProfilesConfigCard } from './AutoProfilesConfigCard'

/** Automatische Profile: the switch with the preset, then the status, the manual check and the create row. */
export function AutoProfilesSection() {
  return (
    <div className="grid gap-5">
      <AutoProfilesConfigCard />
      <AutoProfileStatusCard />
    </div>
  )
}
