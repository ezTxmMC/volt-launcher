import { useRef, useState } from 'react'
import type { Job } from '@shared/models'
import { summarizeSyncJob } from '@/lib/syncResult'
import type { SyncJobSummary } from '@/lib/syncResult'
import { useJobFinished, useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'

/**
 * Starts one link or sync job and keeps its outcome: `running` while it runs, then the result summary.
 * `onFinished` runs when the job ends, whatever the outcome (reload your lists there).
 */
export function useSyncRun(onFinished?: (job: Job) => void): {
  running: boolean
  summary: SyncJobSummary | null
  start: (request: () => Promise<Job>) => Promise<void>
  dismiss: () => void
} {
  const { track } = useJobs()
  const toast = useToast()
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<SyncJobSummary | null>(null)
  const current = useRef<string | null>(null)

  useJobFinished((job) => {
    if (job.id !== current.current) return
    current.current = null
    setRunning(false)
    setSummary(job.state === 'done' ? summarizeSyncJob(job) : null)
    onFinished?.(job)
  })

  const start = async (request: () => Promise<Job>): Promise<void> => {
    setSummary(null)
    setRunning(true)
    try {
      const job = await request()
      current.current = job.id
      track(job)
    } catch (error) {
      setRunning(false)
      toast.error(error)
    }
  }

  return {
    running,
    summary,
    start,
    dismiss: () => setSummary(null)
  }
}
