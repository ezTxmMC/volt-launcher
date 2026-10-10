import { Link } from 'react-router'
import { useI18n } from '@/i18n'
import { EmptyState } from '@/components/ui/Feedback'
import { Page } from '@/components/ui/Page'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <Page>
      <EmptyState
        icon="lucide:compass"
        title={t('notFound.title')}
        action={
          <Link to="/" className="text-accent hover:underline">
            {t('notFound.home')}
          </Link>
        }
      />
    </Page>
  )
}
