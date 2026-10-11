import { useState } from 'react'
import { useI18n } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { Page, PageHeader } from '@/components/ui/Page'
import { Tabs } from '@/components/ui/Tabs'
import { AdvancedSection } from './settings/AdvancedSection'
import { AppearanceSection } from './settings/AppearanceSection'
import { GeneralSection } from './settings/GeneralSection'
import { JavaSection } from './settings/JavaSection'
import { ProvidersSection } from './settings/ProvidersSection'
import { SyncPacksSection } from './settings/syncpacks/SyncPacksSection'
import { UpdatesSection } from './settings/UpdatesSection'

type SectionId = 'general' | 'appearance' | 'java' | 'providers' | 'syncpacks' | 'updates' | 'advanced'

/** The sections of the old settings screen (ui/src/components/settings/settingsData.ts), in its order. */
const SECTIONS: ReadonlyArray<{ id: SectionId; icon: string; labelKey: MessageKey }> = [
  { id: 'general', icon: 'lucide:sun', labelKey: 'settings.section.general' },
  { id: 'appearance', icon: 'lucide:monitor', labelKey: 'settings.section.appearance' },
  { id: 'java', icon: 'lucide:coffee', labelKey: 'settings.section.java' },
  { id: 'providers', icon: 'lucide:blocks', labelKey: 'settings.section.providers' },
  { id: 'syncpacks', icon: 'lucide:layers', labelKey: 'syncpacks.section' },
  { id: 'updates', icon: 'lucide:download', labelKey: 'settings.section.updates' },
  { id: 'advanced', icon: 'lucide:settings-2', labelKey: 'settings.section.advanced' }
]

export function SettingsPage() {
  const { t } = useI18n()
  const [section, setSection] = useState<SectionId>('general')

  return (
    <Page>
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />

      <Tabs
        label={t('settings.nav')}
        value={section}
        onChange={setSection}
        items={SECTIONS.map((item) => ({ id: item.id, icon: item.icon, label: t(item.labelKey) }))}
      />

      {section === 'general' && <GeneralSection />}
      {section === 'appearance' && <AppearanceSection />}
      {section === 'java' && <JavaSection />}
      {section === 'providers' && <ProvidersSection />}
      {section === 'syncpacks' && <SyncPacksSection />}
      {section === 'updates' && <UpdatesSection />}
      {section === 'advanced' && <AdvancedSection />}
    </Page>
  )
}
