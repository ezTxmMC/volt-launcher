import { useCallback, useState } from 'react'
import type { ProjectSummary } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Field, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'

/**
 * Installs a mod, resource pack, shader or data pack straight into a chosen profile, without
 * opening the project page. The backend picks the newest version that fits the profile.
 */
export function QuickAddModal({ project, onClose }: { project: ProjectSummary; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const { track } = useJobs()
  const load = useCallback(() => api.profiles.list(), [])
  const { data: profiles, error, reload } = useAsync(load)
  const [chosenId, setChosenId] = useState('')
  const [withDependencies, setWithDependencies] = useState(true)
  const [busy, setBusy] = useState(false)

  const selectedId = chosenId || profiles?.[0]?.id || ''

  const install = async (): Promise<void> => {
    const target = profiles?.find((profile) => profile.id === selectedId)
    if (!target) return
    setBusy(true)
    try {
      const job = await api.providers.installContent(target.id, {
        provider: project.provider,
        projectId: project.id,
        kind: project.kind,
        withDependencies
      })
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
            disabled={!selectedId || profiles?.length === 0}
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
            <label className="flex cursor-pointer items-center gap-2.5 text-[15px] text-fg/70">
              <input
                type="checkbox"
                checked={withDependencies}
                onChange={(event) => setWithDependencies(event.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
              {t('install.withDependencies')}
            </label>
          </>
        )}
      </div>
    </Modal>
  )
}
