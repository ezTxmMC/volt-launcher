import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import type { LogInfo, Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { formatBytes, formatRelative } from '@/lib/format'
import { useAsync } from '@/lib/hooks'
import { useToast } from '@/state/toast'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Stagger } from '@/components/motion/Stagger'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Switch } from '@/components/ui/Switch'

/** Text kept in the viewer while following a live log; older lines drop off. */
const MAX_VIEW_CHARS = 300_000
const FOLLOW_INTERVAL_MS = 1500

export function LogsPanel({ profile }: { profile: Profile }) {
  const { t, language } = useI18n()
  const toast = useToast()
  const load = useCallback(() => api.saves.logs(profile.id).then((result) => result.logs), [profile.id])
  const { data: logs, error, loading, reload } = useAsync(load)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = logs?.find((log) => log.id === selectedId) ?? logs?.[0] ?? null

  const showLatestCrash = async (): Promise<void> => {
    try {
      const result = await api.saves.latestCrash(profile.id)
      if (result.log) setSelectedId(result.log.id)
      else toast.info(t('saves.logs.noCrash'))
    } catch (failure) {
      toast.error(failure)
    }
  }

  if (!logs && loading) return <LoadingBlock />
  if (error && !logs) return <ErrorNotice message={error} onRetry={reload} />

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <Button icon="lucide:file-warning" onClick={() => void showLatestCrash()}>
          {t('saves.logs.latestCrash')}
        </Button>
        {error && <ErrorNotice message={error} onRetry={reload} />}
        {logs && logs.length === 0 && (
          <EmptyState icon="lucide:file-text" title={t('saves.logs.none')} />
        )}
        {logs && logs.length > 0 && (
          <Stagger as="ul" className="max-h-[70vh] divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface">
            {logs.map((log) => (
              <li key={log.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(log.id)}
                  aria-current={selected?.id === log.id}
                  className={`grid w-full gap-0.5 px-3 py-2.5 text-left transition-colors ${
                    selected?.id === log.id ? 'bg-accent-soft' : 'hover:bg-surface-3'
                  }`}
                >
                  <span className="truncate text-[13.5px] font-medium" title={log.label}>
                    {log.label}
                  </span>
                  <span className="truncate text-xs text-subtle">
                    {t(KIND_KEYS[log.kind])} · {formatBytes(log.sizeBytes, language)} · {formatRelative(log.modifiedAt, language)}
                  </span>
                </button>
              </li>
            ))}
          </Stagger>
        )}
      </div>

      <div className="min-w-0">
        {selected ? (
          <LogViewer key={selected.id} profile={profile} log={selected} onCleared={reload} />
        ) : (
          <EmptyState icon="lucide:file-text" title={t('saves.logs.none')} />
        )}
      </div>
    </div>
  )
}

const KIND_KEYS = {
  launcher: 'saves.logs.kind.launcher',
  game: 'saves.logs.kind.game',
  crash: 'saves.logs.kind.crash'
} as const

function LogViewer({ profile, log, onCleared }: { profile: Profile; log: LogInfo; onCleared: () => void }) {
  const { t, language } = useI18n()
  const toast = useToast()
  const [text, setText] = useState('')
  const [offset, setOffset] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [follow, setFollow] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [clearing, setClearing] = useState(false)
  const viewRef = useRef<HTMLPreElement>(null)

  // The tail of the log, on open and on refresh.
  useEffect(() => {
    let cancelled = false
    api.saves.readLog(profile.id, log.id, -1).then(
      (chunk) => {
        if (cancelled) return
        setText(chunk.text)
        setOffset(chunk.nextOffset)
        setTruncated(chunk.truncated)
        setLoaded(true)
      },
      (failure: unknown) => {
        if (!cancelled) toast.error(failure)
      }
    )
    return () => {
      cancelled = true
    }
  }, [profile.id, log.id, log.modifiedAt, reloadKey, toast])

  // Following a live log: ask for what was written after the last offset.
  useEffect(() => {
    if (!follow || !log.live) return
    let cancelled = false
    const timer = window.setInterval(() => {
      api.saves.readLog(profile.id, log.id, offset).then(
        (chunk) => {
          if (cancelled) return
          if (chunk.offset !== offset) {
            // The file was replaced or cleared while following: start over from its tail.
            setReloadKey((key) => key + 1)
            return
          }
          if (chunk.text !== '') {
            setText((current) => (current + chunk.text).slice(-MAX_VIEW_CHARS))
            setOffset(chunk.nextOffset)
          }
        },
        () => undefined
      )
    }, FOLLOW_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [follow, log.live, log.id, profile.id, offset])

  const jumpToEnd = useCallback(() => {
    const view = viewRef.current
    if (view) view.scrollTop = view.scrollHeight
  }, [])

  // Keep the newest line visible while following, and on the first load.
  useEffect(() => {
    if (loaded && (follow || text !== '')) jumpToEnd()
  }, [text, loaded, follow, jumpToEnd])

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium" title={log.label}>
            {log.label}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge>{t(KIND_KEYS[log.kind])}</Badge>
            {log.live && <Badge tone="success">{t('saves.logs.live')}</Badge>}
            {log.compressed && <Badge>{t('saves.logs.compressed')}</Badge>}
            <Badge>{formatBytes(log.sizeBytes, language)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {log.live && (
            <Switch checked={follow} onChange={setFollow} label={t('saves.logs.follow')} />
          )}
          {log.live && <span className="text-[13px] text-muted">{t('saves.logs.follow')}</span>}
          <Button icon="lucide:arrow-down-to-line" onClick={jumpToEnd}>
            {t('saves.logs.end')}
          </Button>
          <Button icon="lucide:refresh-cw" onClick={() => setReloadKey((key) => key + 1)}>
            {t('saves.refresh')}
          </Button>
          {window.volt && (
            <Button
              icon="lucide:folder-open"
              onClick={() =>
                void api.saves
                  .openLogFolder(profile.id, log.id)
                  .then((folder) => window.volt?.openPath(folder.path))
                  .then((problem) => problem && toast.error(problem), (failure: unknown) => toast.error(failure))
              }
            >
              {t('saves.openFolder')}
            </Button>
          )}
          {log.kind === 'launcher' && (
            <Button variant="danger" icon="lucide:eraser" onClick={() => setClearing(true)}>
              {t('saves.logs.clear')}
            </Button>
          )}
        </div>
      </div>

      {truncated && <p className="text-[13px] text-subtle">{t('saves.logs.truncated')}</p>}

      <pre
        ref={viewRef}
        className="max-h-[65vh] min-h-48 overflow-auto rounded-xl border border-line bg-surface-input p-3 font-mono text-[12px] leading-[1.55] whitespace-pre-wrap break-words text-fg/90"
      >
        {!loaded ? (
          <span className="flex items-center gap-2 text-subtle">
            <Icon icon="lucide:loader-circle" className="size-4 animate-spin" />
          </span>
        ) : text === '' ? (
          <span className="text-subtle">{t('saves.logs.empty')}</span>
        ) : (
          text
        )}
      </pre>

      {clearing && (
        <ConfirmModal
          title={t('saves.logs.clearTitle')}
          message={t('saves.logs.clearMessage')}
          confirmLabel={t('saves.logs.clear')}
          onClose={() => setClearing(false)}
          onConfirm={async () => {
            await api.saves.clearLog(profile.id, log.id)
            setText('')
            setOffset(0)
            onCleared()
            toast.success(t('saves.deleted'))
          }}
        />
      )}
    </div>
  )
}
