import { useNavigate } from 'react-router'
import type { Profile } from '@shared/models'
import { useLaunchProfile } from '@/components/home/hooks/useLaunchProfile'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { ContextMenu, type ContextMenuEntry } from '@/components/ui/ContextMenu'

export interface ProfileContextMenuProps {
  profile: Profile
  /** The profile is running or busy: start, verify and delete are not offered. */
  running: boolean
  x: number
  y: number
  onClose: () => void
  /** Called after an action changed the profile (favourite). */
  onChanged?: () => void
  /** Opens the delete confirmation. The card owns the dialog, so it survives this menu closing. */
  onDelete: () => void
}

/**
 * The right-click menu of a profile card. Every item calls an existing action: the launch hook of
 * the play button, the profile route, the open-folder bridge, the duplicate, favourite, verify and
 * delete endpoints of the profile page.
 */
export function ProfileContextMenu({ profile, running, x, y, onClose, onChanged, onDelete }: ProfileContextMenuProps) {
  const { t } = useI18n()
  const toast = useToast()
  const { track } = useJobs()
  const navigate = useNavigate()
  const launch = useLaunchProfile()
  const favourite = profile.favourite === true

  const failed = (error: unknown): void => toast.error(error)

  const items: ContextMenuEntry[] = [
    {
      id: 'start',
      label: t('profiles.menu.start'),
      icon: 'lucide:play',
      disabled: running,
      onSelect: () => void launch(profile.id).catch(failed)
    },
    {
      id: 'open',
      label: t('profiles.menu.open'),
      icon: 'lucide:external-link',
      onSelect: () => void navigate(`/profiles/${profile.id}`)
    },
    ...(window.volt
      ? [
          {
            id: 'folder',
            label: t('profiles.menu.openFolder'),
            icon: 'lucide:folder-open',
            onSelect: () =>
              void window.volt
                ?.openPath(profile.gameDir)
                .then((problem) => {
                  if (problem) toast.error(problem)
                })
                .catch(failed)
          }
        ]
      : []),
    {
      id: 'duplicate',
      label: t('profiles.menu.duplicate'),
      icon: 'lucide:copy',
      onSelect: () =>
        void api.profiles
          .duplicate(profile.id)
          .then((job) => {
            track(job)
            toast.info(t('profiles.menu.duplicateStarted', { name: profile.name }))
          })
          .catch(failed)
    },
    {
      id: 'favourite',
      label: favourite ? t('profiles.menu.unfavourite') : t('profiles.menu.favourite'),
      icon: 'lucide:star',
      onSelect: () =>
        void api.profiles
          .update(profile.id, { favourite: !favourite })
          .then(() => onChanged?.())
          .catch(failed)
    },
    { id: 'sep-1', separator: true },
    {
      id: 'verify',
      label: t('profiles.menu.verify'),
      icon: 'lucide:shield-check',
      disabled: running,
      onSelect: () =>
        void api.profiles
          .verify(profile.id, false)
          .then((job) => {
            track(job)
            toast.info(t('profiles.menu.verifyStarted', { name: profile.name }))
          })
          .catch(failed)
    },
    { id: 'sep-2', separator: true },
    {
      id: 'delete',
      label: t('profiles.menu.delete'),
      icon: 'lucide:trash-2',
      danger: true,
      disabled: running,
      onSelect: onDelete
    }
  ]

  return <ContextMenu x={x} y={y} label={t('profiles.menu.label')} items={items} onClose={onClose} />
}
