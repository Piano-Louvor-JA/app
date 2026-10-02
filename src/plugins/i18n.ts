import { createI18n } from 'vue-i18n'

import ptBR from '@locales/pt-BR'
import en from '@locales/en'
import es from '@locales/es'

import albumsPtBR from '@modules/albums/locales/pt-BR'
import albumsEn from '@modules/albums/locales/en'
import albumsEs from '@modules/albums/locales/es'
import communityPtBR from '@modules/community/locales/pt-BR'
import communityEn from '@modules/community/locales/en'
import communityEs from '@modules/community/locales/es'

import biblePtBR from '@modules/bible/locales/pt-BR'
import bibleEn from '@modules/bible/locales/en'
import bibleEs from '@modules/bible/locales/es'

import clockPtBR from '@modules/clock/locales/pt-BR'
import clockEn from '@modules/clock/locales/en'
import clockEs from '@modules/clock/locales/es'

import countdownPtBR from '@modules/countdown/locales/pt-BR'
import countdownEn from '@modules/countdown/locales/en'
import countdownEs from '@modules/countdown/locales/es'

import homePtBR from '@modules/home/locales/pt-BR'
import homeEn from '@modules/home/locales/en'
import homeEs from '@modules/home/locales/es'

import liturgyPtBR from '@modules/liturgy/locales/pt-BR'
import liturgyEn from '@modules/liturgy/locales/en'
import liturgyEs from '@modules/liturgy/locales/es'

import mediaPtBR from '@modules/media/locales/pt-BR'
import mediaEn from '@modules/media/locales/en'
import mediaEs from '@modules/media/locales/es'

import randomPtBR from '@modules/random/locales/pt-BR'
import randomEn from '@modules/random/locales/en'
import randomEs from '@modules/random/locales/es'

import settingsPtBR from '@modules/settings/locales/pt-BR'
import settingsEn from '@modules/settings/locales/en'
import settingsEs from '@modules/settings/locales/es'

import startingPtBR from '@modules/starting/locales/pt-BR'
import startingEn from '@modules/starting/locales/en'
import startingEs from '@modules/starting/locales/es'

import syncPtBR from '@modules/sync/locales/pt-BR'
import syncEn from '@modules/sync/locales/en'
import syncEs from '@modules/sync/locales/es'

import timerPtBR from '@modules/timer/locales/pt-BR'
import timerEn from '@modules/timer/locales/en'
import timerEs from '@modules/timer/locales/es'

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference } from '@shared/services/user-preferences'

export const SUPPORTED_LOCALES = ['pt-BR', 'en', 'es'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: SupportedLocale = 'pt-BR'

/**
 * Retorna o idioma armazenado nas preferencias do usuario,
 * ou `DEFAULT_LOCALE` se nao houver preferencia valida.
 */
export function detectInitialLocale(): SupportedLocale {
  const saved = getUserPreference<string>(USER_PREFERENCE_KEYS.language, null)
  if (saved && SUPPORTED_LOCALES.includes(saved as SupportedLocale)) {
    return saved as SupportedLocale
  }
  return DEFAULT_LOCALE
}

/**
 * Converte um locale BCP-47 (ex: `pt-BR`, `en-US`, `es-ES`) para o
 * prefixo usado pela API do Louvor JA (`pt`, `en`, `es`).
 */
export function localeToApiPrefix(locale: string): string {
  const prefix = locale.slice(0, 2).toLowerCase()
  if (prefix === 'en' || prefix === 'es') return prefix
  return 'pt'
}

const initialLocale = detectInitialLocale()

export default createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    'pt-BR': {
      ...ptBR,
      ...albumsPtBR,
      ...communityPtBR,
      ...biblePtBR,
      ...clockPtBR,
      ...countdownPtBR,
      ...homePtBR,
      ...liturgyPtBR,
      ...mediaPtBR,
      ...randomPtBR,
      ...settingsPtBR,
      ...startingPtBR,
      ...syncPtBR,
      ...timerPtBR,
    },
    en: {
      ...en,
      ...albumsEn,
      ...communityEn,
      ...bibleEn,
      ...clockEn,
      ...countdownEn,
      ...homeEn,
      ...liturgyEn,
      ...mediaEn,
      ...randomEn,
      ...settingsEn,
      ...startingEn,
      ...syncEn,
      ...timerEn,
    },
    es: {
      ...es,
      ...albumsEs,
      ...communityEs,
      ...bibleEs,
      ...clockEs,
      ...countdownEs,
      ...homeEs,
      ...liturgyEs,
      ...mediaEs,
      ...randomEs,
      ...settingsEs,
      ...startingEs,
      ...syncEs,
      ...timerEs,
    },
  },
})
