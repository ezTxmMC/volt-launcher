import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { PROVIDER_NAMES } from '@/lib/labels'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { ConfirmModal } from '@/components/ConfirmModal'
import { formatPlaytime } from '@/components/ProfileCard'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Card } from '@/components/ui/Page'
import { VerifyCard } from './VerifyCard'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 font-medium break-all">{value}</dd>
    </div>
  )
}

/** Asks for the copy's name; the copy itself runs as a job. */
function DuplicateModal({ profile, onClose, onStarted }: { profile: Profile; onClose: () => void; onStarted: (jobId: string) => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const { track } = useJobs()
  const [name, setName] = useState(`${profile.name} (Kopie)`)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (busy || name.trim() === '') return
    setBusy(true)
    try {
      const job = await api.profiles.duplicate(profile.id, name.trim())
      track(job)
      onStarted(job.id)
      onClose()
    } catch (error) {
      toast.error(error)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('profile.duplicate.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon="lucide:copy" disabled={name.trim() === ''} loading={busy} onClick={() => void submit()}>
            {t('profile.duplicate')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="text-muted">{t('profile.duplicate.message')}</p>
        <Field label={t('profile.duplicate.name')}>
          <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

export function OverviewTab({ profile }: { profile: Profile; onChanged: () => void }) {
  const { t, language } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [copyJobId, setCopyJobId] = useState<string | null>(null)

  // The copy is opened when its job succeeds; a failed copy shows its error.
  useJobFinished((job) => {
    if (job.id !== copyJobId) return
    setCopyJobId(null)
    if (job.state === 'done' && typeof job.result?.profileId === 'string') {
      toast.success(t('profile.duplicate.done', { name: String(job.result.name ?? '') }))
      void navigate(`/profiles/${job.result.profileId}`)
    } else if (job.state === 'failed') {
      toast.error(job.error ?? job.title)
    }
  })

  const openFolder = async (): Promise<void> => {
    const problem = await window.volt?.openPath(profile.gameDir)
    if (problem) toast.error(problem)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-6">
        <Card className="grid gap-4">
          <h3 className="text-base font-semibold">{t('profile.info.title')}</h3>
          <dl className="grid gap-3">
            <InfoRow label={t('profile.info.created')} value={formatDate(profile.createdAt, language)} />
            <InfoRow
              label={t('profile.info.lastPlayed')}
              value={profile.lastPlayed ? formatDate(profile.lastPlayed, language) : t('profiles.neverPlayed')}
            />
            <InfoRow label={t('profile.info.playtime')} value={formatPlaytime(profile.totalPlaytimeMs)} />
            <InfoRow label={t('profile.info.gameDir')} value={profile.gameDir} />
            {profile.source && (
              <InfoRow
                label={t('profile.info.source')}
                value={`${profile.source.name} (${PROVIDER_NAMES[profile.source.provider]})`}
              />
            )}
          </dl>
          <div className="flex flex-wrap gap-2">
            {window.volt && (
              <Button icon="lucide:folder-open" onClick={() => void openFolder()}>
                {t('profile.info.openFolder')}
              </Button>
            )}
            <Button icon="lucide:copy" onClick={() => setDuplicating(true)}>
              {t('profile.duplicate')}
            </Button>
          </div>
        </Card>

        <VerifyCard profile={profile} />
      </div>

      <div className="grid content-start gap-6">
        <Card className="grid gap-3 border-danger/30">
          <h3 className="text-base font-semibold text-danger">{t('profile.danger.title')}</h3>
          <p className="text-muted">{t('profile.danger.description')}</p>
          <Button variant="danger" icon="lucide:trash-2" onClick={() => setConfirmDelete(true)}>
            {t('profile.delete')}
          </Button>
        </Card>
      </div>

      {duplicating && (
        <DuplicateModal profile={profile} onClose={() => setDuplicating(false)} onStarted={setCopyJobId} />
      )}

      {confirmDelete && (
        <ConfirmModal
          title={t('profile.delete.title')}
          message={t('profile.delete.message', { name: profile.name })}
          confirmLabel={t('profile.delete')}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api.profiles.remove(profile.id)
            toast.success(t('profile.deleted', { name: profile.name }))
            void navigate('/profiles', { replace: true })
          }}
        />
      )}
    </div>
  )
}
