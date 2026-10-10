import { useState } from 'react'
import type { ExportFormat, ExportResult, Job, Profile } from '@shared/models'
import { useI18n } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'

/** The folder part of a file path (both separators). */
function folderOf(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, '')
}

/** Writes the profile as a Modrinth .mrpack or a CurseForge zip into the exports folder. */
export function ExportDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [format, setFormat] = useState<ExportFormat>('mrpack')
  const [version, setVersion] = useState('1.0.0')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      const exported = await api.modpack.export(profile.id, format, version.trim())
      setResult(exported)
      toast.success(t('modpack.exportDone', { file: exported.fileName }))
    } catch (problem) {
      toast.error(problem)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('modpack.exportTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button variant="primary" icon="lucide:package-open" loading={busy} onClick={() => void run()}>
            {busy ? t('modpack.exportRunning') : t('modpack.export')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-muted">
          {profile.name} · {profile.minecraftVersion}
        </p>
        <Field label={t('modpack.exportFormat')}>
          <Select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)} disabled={busy}>
            <option value="mrpack">{t('modpack.mrpack')}</option>
            <option value="curseforge">{t('modpack.curseforge')}</option>
          </Select>
        </Field>
        <Field label={t('modpack.exportVersion')} hint={t('modpack.exportHint')}>
          <TextInput value={version} onChange={(event) => setVersion(event.target.value)} disabled={busy} />
        </Field>
        {result && (
          <div className="grid gap-2 rounded-xl border border-line bg-surface px-4 py-3">
            <p className="font-medium">{t('modpack.exportDone', { file: result.fileName })}</p>
            <p className="text-sm text-muted">
              {t('modpack.exportSummary', { referenced: result.referenced, bundled: result.bundled })}
            </p>
            {result.notes.map((note) => (
              <p key={note} className="text-sm text-muted">
                {note}
              </p>
            ))}
            {window.volt && (
              <Button
                size="sm"
                icon="lucide:folder-open"
                className="w-fit"
                onClick={() => void window.volt?.openPath(folderOf(result.path))}
              >
                {t('modpack.showFolder')}
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

/**
 * Creates a profile from a pack file on disk (.mrpack, CurseForge zip or Technic zip). The
 * finished job is reported by the caller through `onStarted`.
 */
export function ImportDialog({ onStarted, onClose }: { onStarted: (job: Job) => void; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (): Promise<void> => {
    if (path.trim() === '') return
    setBusy(true)
    try {
      const job = await api.modpack.importFile(path.trim(), name.trim())
      onStarted(job)
      onClose()
    } catch (problem) {
      toast.error(problem)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('modpack.importTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            icon="lucide:download"
            loading={busy}
            disabled={path.trim() === ''}
            onClick={() => void run()}
          >
            {t('modpack.import')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-muted">{t('modpack.importHint')}</p>
        <Field label={t('modpack.importPath')}>
          <TextInput
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/home/…/pack.mrpack"
            disabled={busy}
          />
        </Field>
        <Field label={t('modpack.importName')}>
          <TextInput value={name} onChange={(event) => setName(event.target.value)} disabled={busy} />
        </Field>
      </div>
    </Modal>
  )
}

/** Longest profile name the install dialog accepts (the backend allows more). */
export const PACK_NAME_MAX = 64
/** The length counter appears from this many characters on. */
const COUNTER_FROM = 48

type NameProblem = 'empty' | 'tooLong' | 'taken'

/** Checks the trimmed name. `taken` is only a warning: the backend accepts duplicate profile names. */
function nameProblemOf(trimmed: string, taken: readonly string[]): NameProblem | null {
  if (trimmed === '') return 'empty'
  if (trimmed.length > PACK_NAME_MAX) return 'tooLong'
  const wanted = trimmed.toLowerCase()
  if (taken.some((other) => other.trim().toLowerCase() === wanted)) return 'taken'
  return null
}

/** The backend answers 409 when the install cannot start (the preload keeps the status on the error). */
function isConflict(problem: unknown): boolean {
  return typeof problem === 'object' && problem !== null && (problem as { status?: unknown }).status === 409
}

/**
 * Asks for the name of the new profile before a modpack is installed as one. The name is sent
 * with the install request. A 409 from the backend is shown inline and keeps the dialog open;
 * other failures are reported as a toast, as before.
 */
export function InstallPackDialog({
  projectName,
  versionNumber,
  takenNames,
  onInstall,
  onClose
}: {
  projectName: string
  versionNumber: string
  /** Names of the existing profiles; undefined while they load. */
  takenNames: readonly string[] | undefined
  onInstall: (name: string) => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [name, setName] = useState(projectName)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState('')

  const trimmed = name.trim()
  const problem = nameProblemOf(trimmed, takenNames ?? [])
  const blocked = problem === 'empty' || problem === 'tooLong'

  const submit = async (): Promise<void> => {
    if (blocked || busy) return
    setBusy(true)
    setConflict('')
    try {
      await onInstall(trimmed)
      onClose()
    } catch (failure) {
      if (isConflict(failure)) setConflict(errorMessage(failure))
      else toast.error(failure)
      setBusy(false)
    }
  }

  const message =
    problem === 'empty'
      ? { text: t('packInstall.nameEmpty'), tone: 'text-danger-text' }
      : problem === 'tooLong'
        ? { text: t('packInstall.nameTooLong', { max: PACK_NAME_MAX }), tone: 'text-danger-text' }
        : conflict
          ? { text: conflict, tone: 'text-danger-text' }
          : problem === 'taken'
            ? { text: t('packInstall.nameTaken'), tone: 'text-warning' }
            : null

  return (
    <Modal
      title={t('packInstall.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            icon="lucide:package-plus"
            loading={busy}
            disabled={blocked}
            onClick={() => void submit()}
          >
            {t('project.installAsProfile')}
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
        <p className="text-muted">
          {projectName} · {versionNumber}
        </p>
        <Field label={t('packInstall.nameLabel')} hint={t('packInstall.nameHint')}>
          <TextInput
            value={name}
            autoComplete="off"
            disabled={busy}
            aria-invalid={blocked}
            onChange={(event) => {
              setName(event.target.value)
              setConflict('')
            }}
          />
        </Field>
        <div className="-mt-2 flex min-h-5 items-start justify-between gap-3 text-[13px] leading-5">
          <p aria-live="polite" className={message?.tone ?? ''}>
            {message?.text}
          </p>
          {trimmed.length >= COUNTER_FROM && (
            <span className={`shrink-0 tabular-nums ${trimmed.length > PACK_NAME_MAX ? 'text-danger-text' : 'text-subtle'}`}>
              {t('packInstall.count', { count: trimmed.length, max: PACK_NAME_MAX })}
            </span>
          )}
        </div>
      </form>
    </Modal>
  )
}
