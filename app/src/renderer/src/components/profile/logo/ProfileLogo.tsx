import { useState } from 'react'
import type { Profile } from '@shared/models'
import type { MessageKey } from '@/i18n'
import { useI18n } from '@/i18n'
import { LOADER_NAMES } from '@/lib/labels'
import { LoaderBadgeArt } from './loaderBadges'
import { useProfileLogo } from './useProfileLogo'

/** Card art: the default version gradient. */
export const ART_STYLE = { background: 'linear-gradient(135deg, #0a1535, #122050)' } as const

export interface ProfileLogoProps {
  profile: Profile
  /** card: fills the image area of a profile card. header: a 96 px tile next to the profile name. */
  variant?: 'card' | 'header'
}

/**
 * The profile's logo. A picture is shown as is (pixelated for the vanilla block). A loader kind, a
 * missing picture, a picture that fails to decode, or a pending answer shows the loader badge. When
 * the endpoint is unavailable, the chosen icon stays, otherwise the loader badge.
 */
export function ProfileLogo({ profile, variant = 'card' }: ProfileLogoProps) {
  const { t } = useI18n()
  const { status, logo } = useProfileLogo(profile)
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const header = variant === 'header'

  const frame = header ? 'size-24 shrink-0 rounded-2xl' : 'size-full'
  const shade = header ? null : (
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[rgba(8,18,34,.95)]" />
  )

  if (status === 'unavailable') {
    // The backend has no logo answer (older binary or an error): the chosen icon stays, otherwise the
    // loader badge from the profile itself, so a profile never shows an empty card.
    return (
      <span className={`relative grid place-items-center overflow-hidden ${frame}`} style={header ? ART_STYLE : undefined}>
        {profile.iconUrl ? (
          <img src={profile.iconUrl} alt="" className="size-full object-cover" />
        ) : (
          <LoaderBadgeArt
            loader={profile.loader}
            label={t('profile.logo.badge', { loader: LOADER_NAMES[profile.loader] })}
            className={header ? 'size-full' : 'size-[84px]'}
          />
        )}
        {shade}
      </span>
    )
  }

  const dataUrl = logo?.dataUrl ?? null
  if (!logo || logo.kind === 'loader' || !dataUrl || brokenUrl === dataUrl) {
    const loader = logo?.loader ?? profile.loader
    return (
      <span className={`relative grid place-items-center overflow-hidden ${frame}`} style={header ? ART_STYLE : undefined}>
        <LoaderBadgeArt
          loader={loader}
          label={t('profile.logo.badge', { loader: LOADER_NAMES[loader] })}
          className={header ? 'size-full' : 'size-[84px]'}
        />
      </span>
    )
  }

  const altKey: MessageKey =
    logo.kind === 'modpack' ? 'profile.logo.alt.modpack' : logo.kind === 'vanilla' ? 'profile.logo.alt.vanilla' : 'profile.logo.alt.custom'
  return (
    <span className={`relative grid place-items-center overflow-hidden ${frame}`} style={header ? ART_STYLE : undefined}>
      <img
        src={dataUrl}
        alt={t(altKey)}
        className="size-full object-cover"
        style={logo.kind === 'vanilla' ? { imageRendering: 'pixelated' } : undefined}
        onError={() => setBrokenUrl(dataUrl)}
      />
      {shade}
    </span>
  )
}
