import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { Job } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useToast } from './toast'

type FinishedListener = (job: Job) => void

interface JobsValue {
  /** Visible jobs, newest first. */
  jobs: Job[]
  runningCount: number
  /** Registers a job returned by an endpoint so it shows up and is polled immediately. */
  track: (job: Job) => void
  cancel: (id: string) => Promise<void>
  /** Hides all finished jobs from the activity panel. */
  clearFinished: () => void
  /** Hides one finished job from the activity panel. */
  dismiss: (id: string) => void
  /** Called once whenever a job leaves the `running` state. Returns an unsubscribe function. */
  onJobFinished: (listener: FinishedListener) => () => void
}

const POLL_INTERVAL_MS = 1000
/** How long a finished launch row stays in the activity panel. */
const LAUNCH_ROW_MS = 4000
const JobsContext = createContext<JobsValue | null>(null)

export function JobsProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const toast = useToast()
  const [jobs, setJobs] = useState<Job[]>([])
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const knownStates = useRef(new Map<string, Job['state']>())
  const listeners = useRef(new Set<FinishedListener>())

  /** Records job states and notifies listeners about jobs that just finished. */
  const observe = useCallback((incoming: Job[], announceUnseenFinished: boolean) => {
    for (const job of incoming) {
      const previous = knownStates.current.get(job.id)
      knownStates.current.set(job.id, job.state)
      const justFinished = job.state !== 'running' && (previous === 'running' || (previous === undefined && announceUnseenFinished))
      if (justFinished) for (const listener of listeners.current) listener(job)
    }
  }, [])

  const refresh = useCallback(async () => {
    const list = await api.jobs.list()
    observe(list, false)
    setJobs(list)
  }, [observe])

  const track = useCallback(
    (job: Job) => {
      observe([job], true)
      setJobs((current) => [job, ...current.filter((existing) => existing.id !== job.id)])
    },
    [observe]
  )

  const cancel = useCallback(
    async (id: string) => {
      await api.jobs.cancel(id)
      await refresh()
    },
    [refresh]
  )

  useEffect(() => {
    void refresh().catch(() => undefined)
  }, [refresh])

  const runningCount = jobs.filter((job) => job.state === 'running').length
  const polling = runningCount > 0

  // Poll only while something is running.
  useEffect(() => {
    if (!polling) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async (): Promise<void> => {
      try {
        await refresh()
      } catch {
        // transient error: try again on the next tick
      }
      if (!stopped) timer = setTimeout(() => void tick(), POLL_INTERVAL_MS)
    }
    timer = setTimeout(() => void tick(), POLL_INTERVAL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [polling, refresh])

  const clearFinished = useCallback(() => {
    setHidden((current) => new Set([...current, ...jobs.filter((job) => job.state !== 'running').map((job) => job.id)]))
  }, [jobs])

  const dismiss = useCallback((id: string) => {
    setHidden((current) => new Set([...current, id]))
  }, [])

  const onJobFinished = useCallback((listener: FinishedListener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  // Toasts for finished and failed jobs, in the old wording. A page that also reports a failure
  // with the same text does not show it twice (see ToastProvider).
  useEffect(
    () =>
      onJobFinished((job) => {
        if (job.state === 'done') {
          // An import reports its own count on the profile page; a second toast would repeat it.
          if (job.kind === 'import') return
          if (job.kind === 'pack-install') {
            const name = job.title.replace(/^Installiere /, '')
            toast.notify('success', t('notify.packInstalled', { name }), t('job.state.done'))
          } else {
            toast.notify('success', job.title, t('job.state.done'))
          }
        } else if (job.state === 'failed') {
          toast.notify('error', job.error ?? job.title, t('job.state.failed'))
        }
      }),
    [onJobFinished, toast, t]
  )

  // A started game is news for a moment only: its launch row leaves the activity panel shortly after.
  const autoHidden = useRef(new Set<string>())
  useEffect(() => {
    for (const job of jobs) {
      if (job.kind === 'launch' && job.state === 'done' && !autoHidden.current.has(job.id)) {
        autoHidden.current.add(job.id)
        window.setTimeout(() => dismiss(job.id), LAUNCH_ROW_MS)
      }
    }
  }, [jobs, dismiss])

  const visible = useMemo(() => jobs.filter((job) => !hidden.has(job.id)), [jobs, hidden])
  const value = useMemo<JobsValue>(
    () => ({ jobs: visible, runningCount, track, cancel, clearFinished, dismiss, onJobFinished }),
    [visible, runningCount, track, cancel, clearFinished, dismiss, onJobFinished]
  )

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}

export function useJobs(): JobsValue {
  const value = useContext(JobsContext)
  if (!value) throw new Error('useJobs must be used inside JobsProvider')
  return value
}

/** Runs `callback` whenever any job finishes. The latest callback is always used. */
export function useJobFinished(callback: FinishedListener): void {
  const { onJobFinished } = useJobs()
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  })
  useEffect(() => onJobFinished((job) => latest.current(job)), [onJobFinished])
}
