import { createI18n } from 'vue-i18n'

import ptBR from '@locales/pt-BR'
import en from '@locales/en'
import es from '@locales/es'
import fr from '@locales/fr'
import uk from '@locales/uk'
import ru from '@locales/ru'

import albumsPtBR from '@modules/albums/locales/pt-BR'
import authEn from '@modules/auth/locales/en'
import albumsEn from '@modules/albums/locales/en'
import authEs from '@modules/auth/locales/es'
import authFr from '@modules/auth/locales/fr'
import authUk from '@modules/auth/locales/uk'
import authRu from '@modules/auth/locales/ru'
import albumsEs from '@modules/albums/locales/es'
import albumsFr from '@modules/albums/locales/fr'
import albumsUk from '@modules/albums/locales/uk'
import albumsRu from '@modules/albums/locales/ru'
import authPtBR from '@modules/auth/locales/pt-BR'
import communityPtBR from '@modules/community/locales/pt-BR'
import communityEn from '@modules/community/locales/en'
import communityEs from '@modules/community/locales/es'
import communityFr from '@modules/community/locales/fr'
import communityUk from '@modules/community/locales/uk'
import communityRu from '@modules/community/locales/ru'

import biblePtBR from '@modules/bible/locales/pt-BR'
import bibleEn from '@modules/bible/locales/en'
import bibleEs from '@modules/bible/locales/es'
import bibleFr from '@modules/bible/locales/fr'
import bibleUk from '@modules/bible/locales/uk'
import bibleRu from '@modules/bible/locales/ru'

import clockPtBR from '@modules/clock/locales/pt-BR'
import clockEn from '@modules/clock/locales/en'
import clockEs from '@modules/clock/locales/es'
import clockFr from '@modules/clock/locales/fr'
import clockUk from '@modules/clock/locales/uk'
import clockRu from '@modules/clock/locales/ru'

import countdownPtBR from '@modules/countdown/locales/pt-BR'
import countdownEn from '@modules/countdown/locales/en'
import countdownEs from '@modules/countdown/locales/es'
import countdownFr from '@modules/countdown/locales/fr'
import countdownUk from '@modules/countdown/locales/uk'
import countdownRu from '@modules/countdown/locales/ru'
import sabbathSchoolPtBR from '@modules/sabbath-school/locales/pt-BR'
import sabbathSchoolEn from '@modules/sabbath-school/locales/en'
import sabbathSchoolEs from '@modules/sabbath-school/locales/es'
import sabbathSchoolRu from '@modules/sabbath-school/locales/ru'
import sabbathSchoolUk from '@modules/sabbath-school/locales/uk'
import sabbathSchoolFr from '@modules/sabbath-school/locales/fr'
import announcementsPtBR from '@modules/announcements/locales/pt-BR'
import announcementsEn from '@modules/announcements/locales/en'
import announcementsEs from '@modules/announcements/locales/es'
import announcementsFr from '@modules/announcements/locales/fr'
import announcementsUk from '@modules/announcements/locales/uk'
import announcementsRu from '@modules/announcements/locales/ru'

import homePtBR from '@modules/home/locales/pt-BR'
import homeEn from '@modules/home/locales/en'
import homeEs from '@modules/home/locales/es'
import homeFr from '@modules/home/locales/fr'
import homeUk from '@modules/home/locales/uk'
import homeRu from '@modules/home/locales/ru'

import liturgyPtBR from '@modules/liturgy/locales/pt-BR'
import liturgyEn from '@modules/liturgy/locales/en'
import liturgyEs from '@modules/liturgy/locales/es'
import liturgyFr from '@modules/liturgy/locales/fr'
import liturgyUk from '@modules/liturgy/locales/uk'
import liturgyRu from '@modules/liturgy/locales/ru'

import mediaPtBR from '@modules/media/locales/pt-BR'
import mediaEn from '@modules/media/locales/en'
import mediaEs from '@modules/media/locales/es'
import mediaFr from '@modules/media/locales/fr'
import mediaUk from '@modules/media/locales/uk'
import mediaRu from '@modules/media/locales/ru'

import randomPtBR from '@modules/random/locales/pt-BR'
import randomEn from '@modules/random/locales/en'
import randomEs from '@modules/random/locales/es'
import randomFr from '@modules/random/locales/fr'
import randomUk from '@modules/random/locales/uk'
import randomRu from '@modules/random/locales/ru'

import settingsPtBR from '@modules/settings/locales/pt-BR'
import settingsEn from '@modules/settings/locales/en'
import settingsEs from '@modules/settings/locales/es'
import settingsFr from '@modules/settings/locales/fr'
import settingsUk from '@modules/settings/locales/uk'
import settingsRu from '@modules/settings/locales/ru'

import startingPtBR from '@modules/starting/locales/pt-BR'
import startingEn from '@modules/starting/locales/en'
import startingEs from '@modules/starting/locales/es'
import startingFr from '@modules/starting/locales/fr'
import startingUk from '@modules/starting/locales/uk'
import startingRu from '@modules/starting/locales/ru'

import syncPtBR from '@modules/sync/locales/pt-BR'
import syncEn from '@modules/sync/locales/en'
import syncEs from '@modules/sync/locales/es'
import syncFr from '@modules/sync/locales/fr'
import syncUk from '@modules/sync/locales/uk'
import syncRu from '@modules/sync/locales/ru'

import timerPtBR from '@modules/timer/locales/pt-BR'
import timerEn from '@modules/timer/locales/en'
import timerEs from '@modules/timer/locales/es'
import timerFr from '@modules/timer/locales/fr'
import timerUk from '@modules/timer/locales/uk'
import timerRu from '@modules/timer/locales/ru'

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference } from '@shared/services/user-preferences'

export const SUPPORTED_LOCALES = ['pt-BR', 'en', 'es', 'ru', 'uk', 'fr'] as const
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
      ...authPtBR,
      ...albumsPtBR,
      ...communityPtBR,
      ...biblePtBR,
      ...clockPtBR,
      ...countdownPtBR,
      ...sabbathSchoolPtBR,
      ...announcementsPtBR,
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
      ...authEn,
      ...albumsEn,
      ...communityEn,
      ...bibleEn,
      ...clockEn,
      ...countdownEn,
      ...sabbathSchoolEn,
      ...announcementsEn,
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
      ...authEs,
      ...albumsEs,
      ...communityEs,
      ...bibleEs,
      ...clockEs,
      ...countdownEs,
      ...sabbathSchoolEs,
      ...announcementsEs,
      ...homeEs,
      ...liturgyEs,
      ...mediaEs,
      ...randomEs,
      ...settingsEs,
      ...startingEs,
      ...syncEs,
      ...timerEs,
    },
    ru: {
      ...ru,
      ...albumsRu,
      ...communityRu,
      ...bibleRu,
      ...clockRu,
      ...countdownRu,
      ...homeRu,
      ...liturgyRu,
      ...mediaRu,
      ...randomRu,
      ...settingsRu,
      ...startingRu,
      ...syncRu,
      ...timerRu,
      ...authRu,
      ...sabbathSchoolRu,
      ...announcementsRu,
    },
    uk: {
      ...uk,
      ...albumsUk,
      ...communityUk,
      ...bibleUk,
      ...clockUk,
      ...countdownUk,
      ...homeUk,
      ...liturgyUk,
      ...mediaUk,
      ...randomUk,
      ...settingsUk,
      ...startingUk,
      ...syncUk,
      ...timerUk,
      ...authUk,
      ...sabbathSchoolUk,
      ...announcementsUk,
    },
    fr: {
      ...fr,
      ...albumsFr,
      ...communityFr,
      ...bibleFr,
      ...clockFr,
      ...countdownFr,
      ...homeFr,
      ...liturgyFr,
      ...mediaFr,
      ...randomFr,
      ...settingsFr,
      ...startingFr,
      ...syncFr,
      ...timerFr,
      ...authFr,
      ...sabbathSchoolFr,
      ...announcementsFr,
    },
  },
})
