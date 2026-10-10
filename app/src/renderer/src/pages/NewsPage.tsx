import { useI18n } from '@/i18n'
import { EmptyState } from '@/components/ui/Feedback'
import { Page, PageHeader } from '@/components/ui/Page'

/** Placeholder for the news feed, which has no backend yet. */
export function NewsPage() {
  const { t } = useI18n()
  return (
    <Page>
      <PageHeader title={t('news.title')} />
      <EmptyState icon="lucide:newspaper" title={t('news.soon')} description={t('news.description')} />
    </Page>
  )
}
