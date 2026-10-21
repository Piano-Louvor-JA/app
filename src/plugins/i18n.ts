import visualIdentity from '@locales/visual-identity'
import navigation from '@locales/navigation'
import study from '@locales/study'
import liturgyPlan from '@locales/liturgy-plan'
import remoteBrowser from '@locales/remote-browser'
import { createI18n } from 'vue-i18n'

import ptBR from '@locales/pt-BR'
import en from '@locales/en'
import es from '@locales/es'
import fr from '@locales/fr'
import screenDetection from '@locales/screen-detection'
import liturgyFr from '@modules/liturgy/locales/fr'
import authFr from '@modules/auth/locales/fr'
import albumsFr from '@modules/albums/locales/fr'
import syncFr from '@modules/sync/locales/fr'
import clockFr from '@modules/clock/locales/fr'
import timerFr from '@modules/timer/locales/fr'
import countdownFr from '@modules/countdown/locales/fr'
import randomFr from '@modules/random/locales/fr'
import mediaFr from '@modules/media/locales/fr'
import communityFr from '@modules/community/locales/fr'
import catalog from '@locales/catalog'
import bibleFr from '@modules/bible/locales/fr'
import homeFr from '@modules/home/locales/fr'
import startingFr from '@modules/starting/locales/fr'
import settingsFr from '@modules/settings/locales/fr'

import albumsPtBR from '@modules/albums/locales/pt-BR'
import authEn from '@modules/auth/locales/en'
import albumsEn from '@modules/albums/locales/en'
import authEs from '@modules/auth/locales/es'
import albumsEs from '@modules/albums/locales/es'
import authPtBR from '@modules/auth/locales/pt-BR'
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

export const SUPPORTED_LOCALES = ['pt-BR', 'en', 'es', 'fr'] as const
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
  fallbackLocale: 'pt-BR',
  messages: {
    fr: { ...fr, ...catalog.fr, ...screenDetection.fr, ...navigation.fr, ...study.fr, ...liturgyPlan.fr, ...remoteBrowser.fr, ...visualIdentity.fr, ...bibleFr, ...homeFr, ...startingFr, ...settingsFr, ...liturgyFr, ...authFr, ...albumsFr, ...clockFr, ...timerFr, ...countdownFr, ...randomFr, ...mediaFr, ...communityFr, sync: { ...fr.sync, ...syncFr.sync } },
    'pt-BR': {
      ...catalog['pt-BR'],
      ...screenDetection['pt-BR'], ...navigation['pt-BR'], ...study['pt-BR'], ...liturgyPlan['pt-BR'], ...remoteBrowser['pt-BR'], ...visualIdentity['pt-BR'],
      ...ptBR,
      ...authPtBR,
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
      ...catalog.en,
      ...screenDetection.en, ...navigation.en, ...study.en, ...liturgyPlan.en, ...remoteBrowser.en, ...visualIdentity.en,
      ...en,
      ...authEn,
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
      ...catalog.es,
      ...screenDetection.es, ...navigation.es, ...study.es, ...liturgyPlan.es, ...remoteBrowser.es, ...visualIdentity.es,
      ...es,
      ...authEs,
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
