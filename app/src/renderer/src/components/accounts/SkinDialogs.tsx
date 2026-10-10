import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useToast } from '@/state/toast'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import type { Skin } from '@shared/models'
import { SkinPreview } from './SkinPreview'
import { notifyChanged } from './data'

/** Largest upload the backend accepts (2 MB). */
const MAX_BYTES = 2 * 1024 * 1024

/** Reads a file as a data URL and its pixel size; the checks match the backend's. */
function readPng(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const image = new Image()
      image.onload = () => resolve({ dataUrl, width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error('not an image'))
      image.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

/** Upload of a PNG skin: checks type, size and dimensions locally, shows a preview, then uploads. */
export function UploadSkinModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [name, setName] = useState('')
  const [slim, setSlim] = useState(false)
  const [picked, setPicked] = useState<{ dataUrl: string; width: number; height: number } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    setPicked(null)
    setProblem(null)
    if (!file) return
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      setProblem(t('skins.invalidFile'))
      return
    }
    if (file.size > MAX_BYTES) {
      setProblem(t('skins.tooLarge'))
      return
    }
    try {
      const read = await readPng(file)
      const legal = read.width === 64 && (read.height === 64 || read.height === 32)
      if (!legal) {
        setProblem(t('skins.invalidSize', { width: read.width, height: read.height }))
        return
      }
      setPicked(read)
      if (name.trim() === '') setName(file.name.replace(/\.png$/i, '').slice(0, 64))
    } catch {
      setProblem(t('skins.invalidFile'))
    }
  }

  const submit = async (): Promise<void> => {
    if (!picked || name.trim() === '' || busy) return
    setBusy(true)
    try {
      const response = await api.skins.add(name.trim(), slim, picked.dataUrl)
      toast.success(t('skins.saved', { name: response.skin.name }))
      notifyChanged('skins')
      onClose()
    } catch (failure) {
      toast.error(failure)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('skins.uploadTitle')}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon="lucide:upload" disabled={!picked || name.trim() === ''} loading={busy} onClick={() => void submit()}>
            {t('skins.uploadAction')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="grid place-items-center rounded-lg border border-line bg-surface-input p-3">
          {picked ? (
            <SkinPreview src={picked.dataUrl} slim={slim} scale={5} label={t('skins.preview')} />
          ) : (
            <div className="grid h-[160px] w-[80px] place-items-center text-center text-[12px] text-subtle">{t('skins.preview')}</div>
          )}
        </div>
        <div className="grid content-start gap-3">
          <Field label={t('skins.file')}>
            <input
              type="file"
              accept="image/png,.png"
              onChange={(event) => void onFile(event)}
              className="text-[14px] text-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-surface-3 file:px-3 file:py-1.5 file:text-fg"
            />
          </Field>
          {problem && <p role="alert" className="text-[13px] text-danger-text">{problem}</p>}
          <Field label={t('skins.name')}>
            <TextInput value={name} maxLength={64} onChange={(event) => setName(event.target.value)} />
          </Field>
          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-0.5">
              <span className="text-[14px] font-semibold">{t('skins.slim')}</span>
              <span className="text-[12px] text-subtle">{t('skins.slimHint')}</span>
            </div>
            <Switch checked={slim} onChange={setSlim} label={t('skins.slim')} />
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function RenameSkinModal({ skin, onClose }: { skin: Skin; onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [name, setName] = useState(skin.name)
  const [busy, setBusy] = useState(false)
  const valid = name.trim() !== ''

  const submit = async (): Promise<void> => {
    if (!valid || busy) return
    setBusy(true)
    try {
      const response = await api.skins.rename(skin.id, name.trim())
      toast.success(t('skins.renamed', { name: response.skin.name }))
      notifyChanged('skins')
      onClose()
    } catch (failure) {
      toast.error(failure)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('skins.renameTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon="lucide:check" disabled={!valid} loading={busy} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label={t('skins.name')}>
          <TextInput value={name} maxLength={64} onChange={(event) => setName(event.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
