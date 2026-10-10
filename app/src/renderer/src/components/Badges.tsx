import type { ContentKind, Loader, ProviderId } from '@shared/models'
import { useI18n } from '@/i18n'
import { KIND_ICONS, KIND_LABELS_SINGLE, LOADER_COLORS, LOADER_NAMES, PROVIDER_ICONS, PROVIDER_NAMES } from '@/lib/labels'
import { Badge } from './ui/Badge'

export function LoaderBadge({ loader }: { loader: Loader | 'unknown' }) {
  const { t } = useI18n()
  return (
    <Badge color={LOADER_COLORS[loader]} capitalize>
      {loader === 'unknown' ? t('loader.unknown') : LOADER_NAMES[loader]}
    </Badge>
  )
}

export function ProviderBadge({ provider }: { provider: ProviderId }) {
  return (
    <Badge tone="neutral" icon={PROVIDER_ICONS[provider]}>
      {PROVIDER_NAMES[provider]}
    </Badge>
  )
}

export function KindBadge({ kind }: { kind: ContentKind }) {
  const { t } = useI18n()
  return (
    <Badge tone="neutral" icon={KIND_ICONS[kind]}>
      {t(KIND_LABELS_SINGLE[kind])}
    </Badge>
  )
}
