import { useState } from 'react'
import type { Skin } from '@shared/models'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { useJobs } from '@/state/jobs'
import { useToast } from '@/state/toast'
import { SkinHead } from '@/components/accounts/SkinPreview'
import { SkinModel3D } from '@/components/accounts/SkinModel3D'
import { RenameSkinModal, UploadSkinModal } from '@/components/accounts/SkinDialogs'
import { notifyChanged, useAccountsView, useSkinLibrary } from '@/components/accounts/data'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorNotice, LoadingBlock } from '@/components/ui/Feedback'
import { Card, Page, PageHeader } from '@/components/ui/Page'
import { ConfirmModal } from '@/components/ConfirmModal'

/** Skin library: preview of the selected skin (front or back), the grid of skins, and the actions on them. */
export function SkinsPage() {
  const { t } = useI18n()
  const toast = useToast()
  const jobs = useJobs()
  const { data, error, reload } = useSkinLibrary()
  const { data: accounts } = useAccountsView()
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [back, setBack] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [renaming, setRenaming] = useState<Skin | null>(null)
  const [deleting, setDeleting] = useState<Skin | null>(null)
  const [applying, setApplying] = useState<string | null>(null)

  const skins = data?.skins ?? []
  const appliedId = data?.selectedSkinId ?? null
  const preview = skins.find((skin) => skin.id === (previewId ?? appliedId)) ?? skins[0]
  const activeAccount = accounts?.accounts.find((account) => account.selected)
  const microsoftActive = activeAccount?.type === 'microsoft'

  const apply = async (skin: Skin): Promise<void> => {
    setApplying(skin.id)
    try {
      const job = await api.skins.apply(skin.id)
      jobs.track(job)
    } catch (failure) {
      toast.error(failure)
    } finally {
      setApplying(null)
    }
  }

  return (
    <Page>
      <PageHeader
        title={t('skins.title')}
        description={t('skins.subtitle')}
        actions={
          <Button variant="primary" icon="lucide:upload" onClick={() => setUploading(true)}>
            {t('skins.upload')}
          </Button>
        }
      />

      {error && <ErrorNotice message={error} onRetry={reload} />}
      {!data && !error && <LoadingBlock />}

      {data && skins.length === 0 && (
        <Card>
          <EmptyState
            icon="lucide:shirt"
            title={t('skins.empty')}
            description={t('skins.emptyHint')}
            action={
              <Button variant="primary" icon="lucide:upload" onClick={() => setUploading(true)}>
                {t('skins.upload')}
              </Button>
            }
          />
        </Card>
      )}

      {data && skins.length > 0 && preview && (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card className="grid justify-items-center gap-4">
            <div className="flex w-full items-center justify-between gap-2">
              <h3 className="truncate text-[15px] font-semibold">{preview.name}</h3>
              {preview.id === appliedId && (
                <Badge tone="accent" icon="lucide:check">
                  {t('skins.active')}
                </Badge>
              )}
            </div>
            <div className="grid h-[280px] place-items-center rounded-lg bg-white/[0.03]">
              <SkinModel3D src={preview.imageDataUrl} slim={preview.slim} back={back} />
            </div>
            <div className="flex gap-2" role="group" aria-label={t('skins.preview')}>
              <Button size="sm" variant={back ? 'secondary' : 'primary'} onClick={() => setBack(false)}>
                {t('skins.front')}
              </Button>
              <Button size="sm" variant={back ? 'primary' : 'secondary'} onClick={() => setBack(true)}>
                {t('skins.back')}
              </Button>
            </div>
            <div className="grid w-full gap-2">
              <Button
                variant="launch"
                icon="lucide:shirt"
                disabled={!microsoftActive || applying !== null || preview.id === appliedId}
                loading={applying === preview.id}
                onClick={() => void apply(preview)}
              >
                {t('skins.apply')}
              </Button>
              {!microsoftActive && <p className="text-center text-[12px] text-warning">{t('skins.onlyMicrosoft')}</p>}
              {microsoftActive && activeAccount && (
                <p className="text-center text-[12px] text-subtle">{t('skins.accountHint', { name: activeAccount.name })}</p>
              )}
            </div>
          </Card>

          <Card>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3" aria-label={t('skins.title')}>
              {skins.map((skin) => (
                <li
                  key={skin.id}
                  className={`grid gap-3 rounded-lg border p-3 transition-colors duration-150 ${
                    skin.id === preview.id ? 'border-[var(--accent-border-active)] bg-accent-soft' : 'border-line bg-white/[0.02]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewId(skin.id)}
                    aria-pressed={skin.id === preview.id}
                    className="flex items-center gap-3 rounded-md text-left"
                  >
                    <SkinHead src={skin.imageDataUrl} size={56} />
                    <span className="grid min-w-0 gap-1">
                      <span className="truncate text-[14px] font-semibold">{skin.name}</span>
                      <span className="flex flex-wrap gap-1">
                        {skin.slim && <Badge>{t('skins.slimBadge')}</Badge>}
                        {skin.id === appliedId && (
                          <Badge tone="accent" icon="lucide:check">
                            {t('skins.active')}
                          </Badge>
                        )}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!microsoftActive || applying !== null || skin.id === appliedId}
                      loading={applying === skin.id}
                      onClick={() => void apply(skin)}
                    >
                      {t('skins.apply')}
                    </Button>
                    <Button size="sm" variant="ghost" icon="lucide:pencil" aria-label={t('skins.rename')} onClick={() => setRenaming(skin)}>
                      {t('skins.rename')}
                    </Button>
                    <Button size="sm" variant="ghost" icon="lucide:trash-2" aria-label={t('skins.delete')} onClick={() => setDeleting(skin)}>
                      {t('skins.delete')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {uploading && <UploadSkinModal onClose={() => setUploading(false)} />}
      {renaming && <RenameSkinModal skin={renaming} onClose={() => setRenaming(null)} />}
      {deleting && (
        <ConfirmModal
          title={t('skins.deleteTitle')}
          message={t('skins.deleteMessage', { name: deleting.name })}
          confirmLabel={t('skins.delete')}
          onConfirm={async () => {
            await api.skins.remove(deleting.id)
            toast.success(t('skins.deleted'))
            notifyChanged('skins')
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </Page>
  )
}
