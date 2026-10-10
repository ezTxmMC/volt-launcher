import { useCallback, useState } from 'react'
import type { Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { formatRelative } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Page'
import { Switch } from '@/components/ui/Switch'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'

/** Check (and optionally repair) the installed game; the last report stays on the card. */
export function VerifyCard({ profile }: { profile: Profile }) {
  const { t, language } = useI18n()
  const toast = useToast()
  const { track } = useJobs()
  const load = useCallback(() => api.profiles.verifyReport(profile.id), [profile.id])
  const { data, reload } = useAsync(load)
  const [repair, setRepair] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useJobFinished((job) => {
    if (job.id !== jobId) return
    setJobId(null)
    if (job.state === 'failed') toast.error(job.error ?? job.title)
    reload()
  })

  const start = async (): Promise<void> => {
    setStarting(true)
    try {
      const job = await api.profiles.verify(profile.id, repair)
      setJobId(job.id)
      track(job)
    } catch (error) {
      toast.error(error)
    } finally {
      setStarting(false)
    }
  }

  const report = data?.report ?? null
  const busy = jobId !== null

  return (
    <Card className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t('profile.verify.title')}</h3>
        {report && <Badge tone={report.ok ? 'success' : 'danger'}>{report.ok ? t('profile.verify.ok') : t('profile.verify.broken', { count: report.libraries.brokenAfter, total: report.libraries.checked })}</Badge>}
      </div>
      <p className="text-muted">{t('profile.verify.description')}</p>
      {report ? (
        <div className="grid gap-1.5 text-[13px] text-subtle">
          <span>{t('profile.verify.checkedAt', { when: formatRelative(report.checkedAt, language) })}</span>
          {!report.ok && report.libraries.examples.length > 0 && (
            <span className="break-all">{report.libraries.examples.join(', ')}</span>
          )}
          <span>
            {t('profile.verify.client', { state: report.client.okAfter ? t('profile.verify.clientOk') : t('profile.verify.clientBroken') })}
          </span>
          {report.repaired && <span>{t('profile.verify.repaired', { count: report.libraries.brokenAfter })}</span>}
        </div>
      ) : (
        <p className="text-[13px] text-subtle">{t('profile.verify.none')}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <Switch checked={repair} onChange={setRepair} label={t('profile.verify.repair')} disabled={busy} />
          {t('profile.verify.repair')}
        </label>
        <Button
          variant="primary"
          icon={repair ? 'lucide:wrench' : 'lucide:shield-check'}
          disabled={busy}
          loading={starting || busy}
          onClick={() => void start()}
        >
          {busy ? t('profile.verify.running') : t('profile.verify.button')}
        </Button>
      </div>
    </Card>
  )
}
