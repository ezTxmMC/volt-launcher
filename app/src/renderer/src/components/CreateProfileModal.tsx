import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { useNavigate } from 'react-router'
import type { Loader, SyncedFolder } from '@shared/models'
import { useI18n } from '@/i18n'
import { api, errorMessage } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { useJobs } from '@/state/jobs'
import { useSettings } from '@/state/settings'
import { useToast } from '@/state/toast'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { FinishStep } from './profile/create/FinishStep'
import { linkSyncPacks } from './profile/linkSyncPacks'
import { StepBar, type WizardStep } from './profile/create/StepBar'
import { StepPanel } from './profile/create/StepPanel'
import { TypeStep } from './profile/create/TypeStep'
import { VersionStep } from './profile/create/VersionStep'
import type { VersionFilter } from './profile/create/versions'
import { nameProblem } from './profile/create/validation'

/**
 * "Create profile" as a three-step wizard: type (loader), version (Minecraft), finish (name and
 * loader version). Escape and the close button ask first when something was typed.
 */
export function CreateProfileModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const { settings } = useSettings()
  const { track } = useJobs()

  const [step, setStep] = useState<WizardStep>(1)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [loader, setLoader] = useState<Loader>('fabric')
  const [minecraftVersion, setMinecraftVersion] = useState('')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [name, setName] = useState('')
  const [synced, setSynced] = useState<SyncedFolder[]>([])
  const [selectedPacks, setSelectedPacks] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<VersionFilter>('releases')
  const [busy, setBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // Existing names, for the duplicate check of step 3.
  const loadProfiles = useCallback(() => api.profiles.list(), [])
  const profiles = useAsync(loadProfiles)
  const existingNames = profiles.data?.map((profile) => profile.name)

  // The synced packs to offer; none selected by default.
  const loadPacks = useCallback(() => api.syncpacks.list(), [])
  const packs = useAsync(loadPacks)
  const syncPacks = packs.data?.packs ?? []

  const canNext = step === 1 || (step === 2 && minecraftVersion !== '')
  const canCreate = step === 3 && nameProblem(name, existingNames) === null && !busy
  const dirty = name !== '' || search !== ''

  const goTo = (target: WizardStep): void => {
    if (busy || target === step) return
    setDirection(target > step ? 1 : -1)
    setStep(target)
    setConfirmDiscard(false)
  }

  const next = (): void => {
    if (step < 3 && canNext) goTo((step + 1) as WizardStep)
  }

  const back = (): void => {
    if (step > 1) goTo((step - 1) as WizardStep)
  }

  // A different loader or version invalidates the loader version picked for the old choice.
  const chooseLoader = (option: Loader): void => {
    if (option === loader) return
    setLoader(option)
    setLoaderVersion('')
  }

  const chooseVersion = (id: string): void => {
    if (id === minecraftVersion) return
    setMinecraftVersion(id)
    setLoaderVersion('')
  }

  const submit = async (): Promise<void> => {
    if (!canCreate) return
    setBusy(true)
    setCreateError(null)
    try {
      const profile = await api.profiles.create({
        name: name.trim(),
        minecraftVersion,
        loader,
        synced,
        ...(loader !== 'vanilla' && loaderVersion !== '' ? { loaderVersion } : {})
      })
      toast.success(t('profiles.created', { name: profile.name }))
      // Linking runs after the wizard has closed; the profile is busy while each pack installs.
      if (selectedPacks.length > 0) {
        linkSyncPacks(profile.id, selectedPacks, track).catch((error: unknown) => toast.error(error))
      }
      onClose()
      void navigate(`/profiles/${profile.id}`)
    } catch (error) {
      setCreateError(errorMessage(error))
      setBusy(false)
    }
  }

  // Closing with typed input asks first; the confirmation is shown inside the dialog.
  const requestClose = (): void => {
    if (busy) return
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return
    const target = event.target instanceof Element ? event.target : null
    // An open dropdown list handles its own keys (its Escape closes only the list).
    if (target?.closest('[role="listbox"]')) return
    if (event.key === 'Escape') {
      // Stops the native <dialog> from closing by itself; the wizard decides.
      event.preventDefault()
      if (confirmDiscard) setConfirmDiscard(false)
      else requestClose()
      return
    }
    if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    // Buttons, links and text areas keep their own Enter behaviour.
    if (confirmDiscard || target?.closest('button, a, textarea, [role="option"]')) return
    if (step === 3) void submit()
    else next()
  }

  // The window listener is registered once and always calls the handler of the latest render.
  const keyHandler = useRef(onKeyDown)
  useEffect(() => {
    keyHandler.current = onKeyDown
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => keyHandler.current(event)
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [])

  return (
    <Modal title={t('profiles.createTitle')} onClose={requestClose} wide>
      <div className="grid min-w-0 gap-5">
        <StepBar current={step} onSelect={goTo} />

        <StepPanel key={step} direction={direction}>
          {step === 1 && <TypeStep loader={loader} onChange={chooseLoader} />}
          {step === 2 && (
            <VersionStep
              loader={loader}
              selected={minecraftVersion}
              onSelect={chooseVersion}
              search={search}
              onSearch={setSearch}
              filter={filter}
              onFilter={setFilter}
            />
          )}
          {step === 3 && (
            <FinishStep
              syncPacks={syncPacks}
              selectedPacks={selectedPacks}
              onSelectedPacks={setSelectedPacks}
              loader={loader}
              minecraftVersion={minecraftVersion}
              loaderVersion={loaderVersion}
              onLoaderVersion={setLoaderVersion}
              name={name}
              onName={setName}
              synced={synced}
              onSynced={setSynced}
              existingNames={existingNames}
              namesError={profiles.error}
              memoryMb={settings.memoryMb}
              createError={createError}
            />
          )}
        </StepPanel>

        {confirmDiscard && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-3">
            <Icon icon="lucide:triangle-alert" className="size-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t('createProfile.discard.title')}</p>
              <p className="text-[13px] text-subtle">{t('createProfile.discard.text')}</p>
            </div>
            <Button size="sm" variant="secondary" autoFocus onClick={() => setConfirmDiscard(false)}>
              {t('createProfile.discard.keep')}
            </Button>
            <Button size="sm" variant="danger" onClick={onClose}>
              {t('createProfile.discard.confirm')}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/7 pt-4">
          {step > 1 ? (
            <Button variant="ghost" icon="lucide:arrow-left" onClick={back}>
              {t('createProfile.back')}
            </Button>
          ) : (
            <Button variant="ghost" onClick={requestClose}>
              {t('common.cancel')}
            </Button>
          )}
          <span className="hidden text-[12px] text-subtle md:inline">{t('createProfile.keys')}</span>
          {step < 3 ? (
            <Button variant="launch" disabled={!canNext} onClick={next}>
              {t('createProfile.next')}
              <Icon icon="lucide:arrow-right" className="size-[13px]" />
            </Button>
          ) : (
            <Button variant="launch" icon="lucide:plus" disabled={!canCreate} loading={busy} onClick={() => void submit()}>
              {t('createProfile.create')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
