import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Language } from '@shared/models'
import { de } from './de'
import type { MessageKey } from './de'
import { en } from './en'

export type { MessageKey }
export type TranslateParams = Record<string, string | number>
export type Translate = (key: MessageKey, params?: TranslateParams) => string

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { de, en }
const STORAGE_KEY = 'volt.language'
export const DEFAULT_LANGUAGE: Language = 'de'

function readCachedLanguage(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'de' || value === 'en') return value
  } catch {
    // storage unavailable
  }
  return DEFAULT_LANGUAGE
}

interface I18nValue {
  language: Language
  setLanguage: (language: Language) => void
  t: Translate
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readCachedLanguage)

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // storage unavailable
    }
  }, [])

  const value = useMemo<I18nValue>(() => {
    const dictionary = DICTIONARIES[language]
    const t: Translate = (key, params) => {
      const template = dictionary[key]
      if (!params) return template
      return template.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match))
    }
    return { language, setLanguage, t }
  }, [language, setLanguage])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
