import { useCallback } from 'react'
import { Icon } from '@iconify/react'
import type { Loader, LoaderVersion, SyncedFolder, SyncPack } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'
import { LOADER_COLORS, LOADER_NAMES } from '@/lib/labels'
import { tintStyle } from '@/components/ui/Badge'
import { Checkbox } from '@/components/ui/Checkbox'
import { ErrorNotice } from '@/components/ui/Feedback'
import { Field, TextInput } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { SYNCED_ITEMS } from '../syncedItems'
import { LOADER_META } from './loaders'
import { MAX_NAME_LENGTH, nameProblem } from './validation'

interface FinishStepProps {
  loader: Loader
  minecraftVersion: string
  loaderVersion: string
  onLoaderVersion: (id: string) => void
  name: string
  onName: (name: string) => void
  /** Folders shared with other profiles; empty shares nothing. */
  synced: readonly SyncedFolder[]
  onSynced: (folders: SyncedFolder[]) => void
  /** The existing synced packs; the block is hidden when there are none. */
  syncPacks: readonly SyncPack[]
  /** Ids of the packs to link after the profile is created. */
  selectedPacks: readonly string[]
  onSelectedPacks: (ids: string[]) => void
  /** Names of the existing profiles; undefined while they load. */
  existingNames: readonly string[] | undefined
  /** Set when the profile list could not be loaded, so duplicates cannot be checked. */
  namesError: string | null
  memoryMb: number
  createError: string | null
}

/**
 * Step 3: profile name, loader version, shared folders, a summary, and the create error (the button is in the
 * dialog footer).
 */
export function FinishStep({
  loader,
  minecraftVersion,
  loaderVersion,
  onLoaderVersion,
  name,
  onName,
  synced,
  onSynced,
  syncPacks,
  selectedPacks,
  onSelectedPacks,
  existingNames,
  namesError,
  memoryMb,
  createError
}: FinishStepProps) {
  const { t } = useI18n()
  // Keeps the list in SYNCED_ITEMS order, so the request body is stable and never has duplicates.
  const setItem = (key: SyncedFolder, on: boolean): void =>
    onSynced(SYNCED_ITEMS.filter((item) => (item.key === key ? on : synced.includes(item.key))).map((item) => item.key))
  const chosen = SYNCED_ITEMS.filter((item) => synced.includes(item.key))
  const chosenPacks = syncPacks.filter((pack) => selectedPacks.includes(pack.id))
  const setPack = (id: string, on: boolean): void =>
    onSelectedPacks(syncPacks.filter((pack) => (pack.id === id ? on : selectedPacks.includes(pack.id))).map((pack) => pack.id))
  const loadLoaderVersions = useCallback(
    () =>
      loader === 'vanilla'
        ? Promise.resolve<LoaderVersion[]>([])
        : api.versions.loader(loader, minecraftVersion),
    [loader, minecraftVersion]
  )
  const { data: loaderVersions, error: loaderError, loading: loadingLoaders } = useAsync(loadLoaderVersions)

  const problem = nameProblem(name, existingNames)
  const trimmed = name.trim()
  const nameMessage =
    problem === 'empty'
      ? { text: t('createProfile.name.empty'), tone: 'hint' as const }
      : problem === 'tooLong'
        ? { text: t('createProfile.name.tooLong', { max: MAX_NAME_LENGTH, count: trimmed.length }), tone: 'error' as const }
        : problem === 'duplicate'
          ? { text: t('createProfile.name.duplicate', { name: trimmed }), tone: 'error' as const }
          : namesError
            ? { text: t('createProfile.name.unchecked'), tone: 'warning' as const }
            : { text: t('createProfile.name.counter', { count: trimmed.length, max: MAX_NAME_LENGTH }), tone: 'hint' as const }
  const toneClass = { hint: 'text-subtle', error: 'text-danger-text', warning: 'text-warning' }[nameMessage.tone]

  const loaderHint = loadingLoaders
    ? t('createProfile.loaderVersion.loading')
    : (loaderError ?? (loaderVersions?.length === 0 ? t('createProfile.loaderVersion.none') : t('createProfile.loaderVersion.hint')))
  const meta = LOADER_META[loader]

  return (
    <div className="grid min-w-0 gap-4">
      <Field label={t('createProfile.name.label')}>
        <TextInput
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder={t('createProfile.name.placeholder')}
          aria-invalid={nameMessage.tone === 'error' || undefined}
          autoFocus
        />
        <span role={nameMessage.tone === 'error' ? 'alert' : undefined} className={`text-[12px] leading-[1.5] ${toneClass}`}>
          {nameMessage.text}
        </span>
      </Field>

      {loader !== 'vanilla' ? (
        <div className="grid min-w-0 gap-1.5">
          <span className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">
            {t('createProfile.loaderVersion.label')}
          </span>
          <Select
            ariaLabel={t('createProfile.loaderVersion.label')}
            value={loaderVersion}
            onChange={onLoaderVersion}
            options={[
              { value: '', label: t('createProfile.loaderVersion.latest') },
              ...(loaderVersions ?? []).map((version) => ({
                value: version.id,
                label: version.stable ? version.id : `${version.id} (${t('createProfile.loaderVersion.beta')})`
              }))
            ]}
          />
          <span className="text-[12px] leading-[1.5] text-subtle">{loaderHint}</span>
        </div>
      ) : (
        <p className="text-[13px] text-subtle">{t('createProfile.loaderVersion.vanilla')}</p>
      )}

      <fieldset className="grid min-w-0 gap-2">
        <legend className="mb-1 text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">
          {t('createProfile.synced.title')}
        </legend>
        <p className="text-[12px] leading-[1.5] text-subtle">
          {t('createProfile.synced.hint')}
        </p>
        {/* A container query: two columns as soon as the section itself is wide enough, whatever the window size. */}
        <div className="@container min-w-0">
          <div className="grid min-w-0 gap-x-6 gap-y-2.5 @md:grid-cols-2">
            {SYNCED_ITEMS.map((item) => (
              <Checkbox
                key={item.key}
                checked={synced.includes(item.key)}
                onChange={(on) => setItem(item.key, on)}
                label={
                  item.hint ? (
                    <span className="grid gap-0.5">
                      <span>{t(item.label.createProfile)}</span>
                      <span className="text-[12px] leading-[1.5] text-subtle">{t(item.hint.createProfile)}</span>
                    </span>
                  ) : (
                    t(item.label.createProfile)
                  )
                }
              />
            ))}
          </div>
        </div>
      </fieldset>

      {syncPacks.length > 0 && (
        <fieldset className="grid min-w-0 gap-2">
          <legend className="mb-1 text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">
            {t('createProfile.syncpacks.title')}
          </legend>
          <p className="text-[12px] leading-[1.5] text-subtle">{t('createProfile.syncpacks.hint')}</p>
          <div className="@container min-w-0">
            <div className="grid min-w-0 gap-x-6 gap-y-2.5 @md:grid-cols-2">
              {syncPacks.map((pack) => (
                <Checkbox
                  key={pack.id}
                  checked={selectedPacks.includes(pack.id)}
                  onChange={(on) => setPack(pack.id, on)}
                  label={
                    <span className="grid gap-0.5">
                      <span>{pack.name}</span>
                      <span className="text-[12px] leading-[1.5] text-subtle">
                        {t('createProfile.syncpacks.entries', { count: pack.entries.length })}
                      </span>
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        </fieldset>
      )}

      <section className="grid gap-3 rounded-[10px] border border-line bg-surface-2 p-4">
        <h3 className="text-[12px] font-bold tracking-[0.14em] text-subtle uppercase">{t('createProfile.summary.title')}</h3>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg" style={tintStyle(LOADER_COLORS[loader])}>
            <Icon icon={meta.icon} className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold">{LOADER_NAMES[loader]}</p>
            <p className="truncate text-[13px] text-subtle tabular-nums">Minecraft {minecraftVersion}</p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-[13.5px]">
          <dt className="text-subtle">{t('createProfile.summary.minecraft')}</dt>
          <dd className="min-w-0 truncate font-semibold tabular-nums">{minecraftVersion}</dd>
          {loader !== 'vanilla' && (
            <>
              <dt className="text-subtle">{t('createProfile.summary.loaderVersion')}</dt>
              <dd className="min-w-0 truncate font-semibold tabular-nums">
                {loaderVersion !== '' ? loaderVersion : t('createProfile.loaderVersion.latest')}
              </dd>
            </>
          )}
          <dt className="text-subtle">{t('createProfile.summary.memory')}</dt>
          <dd className="min-w-0">
            <span className="font-semibold tabular-nums">{t('createProfile.summary.memoryValue', { value: memoryMb })}</span>
            <span className="ml-2 text-[12.5px] text-subtle">{t('createProfile.summary.memoryHint')}</span>
          </dd>
          {chosen.length > 0 && (
            <>
              <dt className="text-subtle">{t('createProfile.synced.summary')}</dt>
              <dd className="min-w-0 font-semibold">{chosen.map((item) => t(item.label.createProfile)).join(', ')}</dd>
            </>
          )}
          {chosenPacks.length > 0 && (
            <>
              <dt className="text-subtle">{t('createProfile.syncpacks.summary')}</dt>
              <dd className="min-w-0 truncate font-semibold">{chosenPacks.map((pack) => pack.name).join(', ')}</dd>
            </>
          )}
        </dl>
      </section>

      {createError && <ErrorNotice message={t('createProfile.failed', { error: createError })} />}
    </div>
  )
}
