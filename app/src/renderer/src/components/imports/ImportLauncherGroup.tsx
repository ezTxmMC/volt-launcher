import { Icon } from '@iconify/react'
import type { ImportCandidate, ImportLauncher } from '@shared/models'
import { useI18n } from '@/i18n'
import { formatBytes } from '@/lib/format'
import { LoaderBadge } from '@/components/Badges'
import { Badge } from '@/components/ui/Badge'
import { Checkbox } from '@/components/ui/Checkbox'
import { CONFIDENCE_LABELS, CONFIDENCE_TONES, itemId, toLoader } from './importModel'

/** One launcher with status `found` or `unavailable`; the `none` launchers are summarised by the dialog. */
export function ImportLauncherGroup({
  launcher,
  selected,
  busy,
  onToggle
}: {
  launcher: ImportLauncher
  selected: ReadonlySet<string>
  busy: boolean
  onToggle: (launcherId: string, profile: ImportCandidate, checked: boolean) => void
}) {
  const { t, language } = useI18n()
  const found = launcher.status === 'found'

  return (
    <section className="border-b border-line last:border-b-0">
      <header className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
        <h3 className="text-[14px] font-semibold">{launcher.name}</h3>
        <Badge tone={CONFIDENCE_TONES[launcher.confidence]}>{t(CONFIDENCE_LABELS[launcher.confidence])}</Badge>
        {found ? (
          <Badge tone="accent" icon="lucide:circle-check">
            {t('imports.status.found')}
          </Badge>
        ) : (
          <Badge tone="neutral" icon="lucide:triangle-alert">
            {t('imports.status.unavailable')}
          </Badge>
        )}
      </header>

      {!found && (
        <p className="px-4 pb-3 text-[12.5px] text-subtle">{launcher.reason ?? t('imports.unavailable.fallback')}</p>
      )}
      {found && launcher.profiles.length === 0 && (
        <p className="px-4 pb-3 text-[12.5px] text-subtle">{t('imports.launcher.noProfiles')}</p>
      )}

      {found && launcher.profiles.length > 0 && (
        <ul className="pb-1">
          {launcher.profiles.map((profile) => {
            const checked = selected.has(itemId({ launcher: launcher.id, key: profile.key }))
            return (
              <li key={profile.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 hover:bg-white/[0.03]">
                <div className="min-w-0 flex-1">
                  {profile.importable ? (
                    <Checkbox
                      checked={checked}
                      disabled={busy}
                      onChange={(value) => onToggle(launcher.id, profile, value)}
                      label={<span className="truncate">{profile.name}</span>}
                      className="max-w-full"
                    />
                  ) : (
                    <div className="flex items-center gap-2.5 text-[15px] text-fg/50">
                      <span className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{profile.name}</span>
                    </div>
                  )}
                  {!profile.importable && (
                    <p className="mt-0.5 pl-[26px] text-[12.5px] text-subtle">
                      {profile.reason ?? t('imports.reason.fallback')}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-[13px] text-muted tabular-nums">
                  <span>{profile.minecraftVersion}</span>
                  <LoaderBadge loader={toLoader(profile.loader)} />
                  <span className="flex w-20 items-center justify-end gap-1 text-subtle">
                    <Icon icon="lucide:hard-drive" className="size-3.5" aria-hidden="true" />
                    {formatBytes(profile.sizeBytes, language)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
