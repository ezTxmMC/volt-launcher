import { useCallback, useState } from 'react'
import type { ProjectSummary } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Field, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { readLastTarget, rememberTarget } from './useInstallTarget'

/**
 * Installs a mod, resource pack, shader or data pack straight into a chosen profile, without
 * opening the project page. The backend picks the newest version that fits the profile. The profile
 * chosen last in this session is preselected; data packs also ask for the world.
 */
export function QuickAddModal({ project, onClose }: { project: ProjectSummary; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const { track } = useJobs()
  const load = useCallback(() => api.profiles.list(), [])
  const { data: profiles, error, reload } = useAsync(load)
  const [chosenId, setChosenId] = useState('')
  const [chosenWorld, setChosenWorld] = useState('')
  const [withDependencies, setWithDependencies] = useState(true)
  const [busy, setBusy] = useState(false)
  const isDataPack = project.kind === 'datapack'

  const last = readLastTarget()
  const selectedId =
    chosenId || (profiles?.some((profile) => profile.id === last) ? last : (profiles?.[0]?.id ?? ''))

  const loadWorlds = useCallback(
    () => (isDataPack && selectedId ? api.content.worlds(selectedId) : Promise.resolve({ worlds: [] })),
    [isDataPack, selectedId]
  )
  const worldsLoad = useAsync(loadWorlds)
  const worlds = worldsLoad.data?.worlds ?? []
  const world = worlds.some((entry) => entry.folder === chosenWorld) ? chosenWorld : (worlds[0]?.folder ?? '')

  const install = async (): Promise<void> => {
    const target = profiles?.find((profile) => profile.id === selectedId)
    if (!target) return
    setBusy(true)
    try {
      const job = await api.providers.installContent(target.id, {
        provider: project.provider,
        projectId: project.id,
        kind: project.kind,
        withDependencies,
        world: isDataPack ? world : undefined
      })
      rememberTarget(target.id)
      track(job)
      toast.info(t('project.installingInto', { profile: target.name }))
      onClose()
    } catch (failure) {
      toast.error(failure)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('discover.quickAdd')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            icon="lucide:download"
            disabled={!selectedId || profiles?.length === 0 || (isDataPack && !world)}
            loading={busy}
            onClick={() => void install()}
          >
            {t('discover.quickAdd.confirm')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-muted">{project.name}</p>
        {error && <ErrorNotice message={error} onRetry={reload} />}
        {!profiles && !error && <LoadingBlock />}
        {profiles?.length === 0 && <p className="text-muted">{t('install.noProfiles')}</p>}
        {profiles && profiles.length > 0 && (
          <>
            <Field label={t('install.profile')} hint={t('discover.quickAdd.hint')}>
              <Select value={selectedId} onChange={(event) => setChosenId(event.target.value)}>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} ({profile.minecraftVersion}, {profile.loader})
                  </option>
                ))}
              </Select>
            </Field>
            {isDataPack && (
              <Field label={t('content.world')} hint={worlds.length === 0 ? t('content.noWorlds') : t('content.worldHint')}>
                <Select value={world} onChange={(event) => setChosenWorld(event.target.value)} disabled={worlds.length === 0}>
                  {worlds.map((entry) => (
                    <option key={entry.folder} value={entry.folder}>
                      {entry.folder}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {project.kind === 'mod' && (
              <Checkbox checked={withDependencies} onChange={setWithDependencies} label={t('install.withDependencies')} />
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
