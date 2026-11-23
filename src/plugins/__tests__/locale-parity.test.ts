// @vitest-environment node
import { describe, it, expect } from 'vitest'

import ptBR from '@locales/pt-BR'
import en from '@locales/en'
import es from '@locales/es'
import fr from '@locales/fr'
import ru from '@locales/ru'
import uk from '@locales/uk'
import ja from '@locales/ja'
import ko from '@locales/ko'
import zh from '@locales/zh'
import tr from '@locales/tr'
import ar from '@locales/ar'
import hi from '@locales/hi'

import albumsPtBR from '@modules/albums/locales/pt-BR'
import albumsEn from '@modules/albums/locales/en'
import albumsEs from '@modules/albums/locales/es'
import albumsFr from '@modules/albums/locales/fr'
import albumsRu from '@modules/albums/locales/ru'
import albumsUk from '@modules/albums/locales/uk'
import albumsJa from '@modules/albums/locales/ja'
import albumsKo from '@modules/albums/locales/ko'
import albumsZh from '@modules/albums/locales/zh'
import albumsTr from '@modules/albums/locales/tr'
import albumsAr from '@modules/albums/locales/ar'
import albumsHi from '@modules/albums/locales/hi'

import authPtBR from '@modules/auth/locales/pt-BR'
import authEn from '@modules/auth/locales/en'
import authEs from '@modules/auth/locales/es'
import authFr from '@modules/auth/locales/fr'
import authRu from '@modules/auth/locales/ru'
import authUk from '@modules/auth/locales/uk'
import authJa from '@modules/auth/locales/ja'
import authKo from '@modules/auth/locales/ko'
import authZh from '@modules/auth/locales/zh'
import authTr from '@modules/auth/locales/tr'
import authAr from '@modules/auth/locales/ar'
import authHi from '@modules/auth/locales/hi'

import announcementsPtBR from '@modules/announcements/locales/pt-BR'
import announcementsEn from '@modules/announcements/locales/en'
import announcementsEs from '@modules/announcements/locales/es'
import announcementsFr from '@modules/announcements/locales/fr'
import announcementsRu from '@modules/announcements/locales/ru'
import announcementsUk from '@modules/announcements/locales/uk'
import announcementsJa from '@modules/announcements/locales/ja'
import announcementsKo from '@modules/announcements/locales/ko'
import announcementsZh from '@modules/announcements/locales/zh'
import announcementsTr from '@modules/announcements/locales/tr'
import announcementsAr from '@modules/announcements/locales/ar'
import announcementsHi from '@modules/announcements/locales/hi'

import biblePtBR from '@modules/bible/locales/pt-BR'
import bibleEn from '@modules/bible/locales/en'
import bibleEs from '@modules/bible/locales/es'
import bibleFr from '@modules/bible/locales/fr'
import bibleRu from '@modules/bible/locales/ru'
import bibleUk from '@modules/bible/locales/uk'
import bibleJa from '@modules/bible/locales/ja'
import bibleKo from '@modules/bible/locales/ko'
import bibleZh from '@modules/bible/locales/zh'
import bibleTr from '@modules/bible/locales/tr'
import bibleAr from '@modules/bible/locales/ar'
import bibleHi from '@modules/bible/locales/hi'

import clockPtBR from '@modules/clock/locales/pt-BR'
import clockEn from '@modules/clock/locales/en'
import clockEs from '@modules/clock/locales/es'
import clockFr from '@modules/clock/locales/fr'
import clockRu from '@modules/clock/locales/ru'
import clockUk from '@modules/clock/locales/uk'
import clockJa from '@modules/clock/locales/ja'
import clockKo from '@modules/clock/locales/ko'
import clockZh from '@modules/clock/locales/zh'
import clockTr from '@modules/clock/locales/tr'
import clockAr from '@modules/clock/locales/ar'
import clockHi from '@modules/clock/locales/hi'

import communityPtBR from '@modules/community/locales/pt-BR'
import communityEn from '@modules/community/locales/en'
import communityEs from '@modules/community/locales/es'
import communityFr from '@modules/community/locales/fr'
import communityRu from '@modules/community/locales/ru'
import communityUk from '@modules/community/locales/uk'
import communityJa from '@modules/community/locales/ja'
import communityKo from '@modules/community/locales/ko'
import communityZh from '@modules/community/locales/zh'
import communityTr from '@modules/community/locales/tr'
import communityAr from '@modules/community/locales/ar'
import communityHi from '@modules/community/locales/hi'

import countdownPtBR from '@modules/countdown/locales/pt-BR'
import countdownEn from '@modules/countdown/locales/en'
import countdownEs from '@modules/countdown/locales/es'
import countdownFr from '@modules/countdown/locales/fr'
import countdownRu from '@modules/countdown/locales/ru'
import countdownUk from '@modules/countdown/locales/uk'
import countdownJa from '@modules/countdown/locales/ja'
import countdownKo from '@modules/countdown/locales/ko'
import countdownZh from '@modules/countdown/locales/zh'
import countdownTr from '@modules/countdown/locales/tr'
import countdownAr from '@modules/countdown/locales/ar'
import countdownHi from '@modules/countdown/locales/hi'

import homePtBR from '@modules/home/locales/pt-BR'
import homeEn from '@modules/home/locales/en'
import homeEs from '@modules/home/locales/es'
import homeFr from '@modules/home/locales/fr'
import homeRu from '@modules/home/locales/ru'
import homeUk from '@modules/home/locales/uk'
import homeJa from '@modules/home/locales/ja'
import homeKo from '@modules/home/locales/ko'
import homeZh from '@modules/home/locales/zh'
import homeTr from '@modules/home/locales/tr'
import homeAr from '@modules/home/locales/ar'
import homeHi from '@modules/home/locales/hi'

import liturgyPtBR from '@modules/liturgy/locales/pt-BR'
import liturgyEn from '@modules/liturgy/locales/en'
import liturgyEs from '@modules/liturgy/locales/es'
import liturgyFr from '@modules/liturgy/locales/fr'
import liturgyRu from '@modules/liturgy/locales/ru'
import liturgyUk from '@modules/liturgy/locales/uk'
import liturgyJa from '@modules/liturgy/locales/ja'
import liturgyKo from '@modules/liturgy/locales/ko'
import liturgyZh from '@modules/liturgy/locales/zh'
import liturgyTr from '@modules/liturgy/locales/tr'
import liturgyAr from '@modules/liturgy/locales/ar'
import liturgyHi from '@modules/liturgy/locales/hi'

import mediaPtBR from '@modules/media/locales/pt-BR'
import mediaEn from '@modules/media/locales/en'
import mediaEs from '@modules/media/locales/es'
import mediaFr from '@modules/media/locales/fr'
import mediaRu from '@modules/media/locales/ru'
import mediaUk from '@modules/media/locales/uk'
import mediaJa from '@modules/media/locales/ja'
import mediaKo from '@modules/media/locales/ko'
import mediaZh from '@modules/media/locales/zh'
import mediaTr from '@modules/media/locales/tr'
import mediaAr from '@modules/media/locales/ar'
import mediaHi from '@modules/media/locales/hi'

import randomPtBR from '@modules/random/locales/pt-BR'
import randomEn from '@modules/random/locales/en'
import randomEs from '@modules/random/locales/es'
import randomFr from '@modules/random/locales/fr'
import randomRu from '@modules/random/locales/ru'
import randomUk from '@modules/random/locales/uk'
import randomJa from '@modules/random/locales/ja'
import randomKo from '@modules/random/locales/ko'
import randomZh from '@modules/random/locales/zh'
import randomTr from '@modules/random/locales/tr'
import randomAr from '@modules/random/locales/ar'
import randomHi from '@modules/random/locales/hi'

import sabbathSchoolPtBR from '@modules/sabbath-school/locales/pt-BR'
import sabbathSchoolEn from '@modules/sabbath-school/locales/en'
import sabbathSchoolEs from '@modules/sabbath-school/locales/es'
import sabbathSchoolFr from '@modules/sabbath-school/locales/fr'
import sabbathSchoolRu from '@modules/sabbath-school/locales/ru'
import sabbathSchoolUk from '@modules/sabbath-school/locales/uk'
import sabbathSchoolJa from '@modules/sabbath-school/locales/ja'
import sabbathSchoolKo from '@modules/sabbath-school/locales/ko'
import sabbathSchoolZh from '@modules/sabbath-school/locales/zh'
import sabbathSchoolTr from '@modules/sabbath-school/locales/tr'
import sabbathSchoolAr from '@modules/sabbath-school/locales/ar'
import sabbathSchoolHi from '@modules/sabbath-school/locales/hi'

import settingsPtBR from '@modules/settings/locales/pt-BR'
import settingsEn from '@modules/settings/locales/en'
import settingsEs from '@modules/settings/locales/es'
import settingsFr from '@modules/settings/locales/fr'
import settingsRu from '@modules/settings/locales/ru'
import settingsUk from '@modules/settings/locales/uk'
import settingsJa from '@modules/settings/locales/ja'
import settingsKo from '@modules/settings/locales/ko'
import settingsZh from '@modules/settings/locales/zh'
import settingsTr from '@modules/settings/locales/tr'
import settingsAr from '@modules/settings/locales/ar'
import settingsHi from '@modules/settings/locales/hi'

import startingPtBR from '@modules/starting/locales/pt-BR'
import startingEn from '@modules/starting/locales/en'
import startingEs from '@modules/starting/locales/es'
import startingFr from '@modules/starting/locales/fr'
import startingRu from '@modules/starting/locales/ru'
import startingUk from '@modules/starting/locales/uk'
import startingJa from '@modules/starting/locales/ja'
import startingKo from '@modules/starting/locales/ko'
import startingZh from '@modules/starting/locales/zh'
import startingTr from '@modules/starting/locales/tr'
import startingAr from '@modules/starting/locales/ar'
import startingHi from '@modules/starting/locales/hi'

import syncPtBR from '@modules/sync/locales/pt-BR'
import syncEn from '@modules/sync/locales/en'
import syncEs from '@modules/sync/locales/es'
import syncFr from '@modules/sync/locales/fr'
import syncRu from '@modules/sync/locales/ru'
import syncUk from '@modules/sync/locales/uk'
import syncJa from '@modules/sync/locales/ja'
import syncKo from '@modules/sync/locales/ko'
import syncZh from '@modules/sync/locales/zh'
import syncTr from '@modules/sync/locales/tr'
import syncAr from '@modules/sync/locales/ar'
import syncHi from '@modules/sync/locales/hi'

import timerPtBR from '@modules/timer/locales/pt-BR'
import timerEn from '@modules/timer/locales/en'
import timerEs from '@modules/timer/locales/es'
import timerFr from '@modules/timer/locales/fr'
import timerRu from '@modules/timer/locales/ru'
import timerUk from '@modules/timer/locales/uk'
import timerJa from '@modules/timer/locales/ja'
import timerKo from '@modules/timer/locales/ko'
import timerZh from '@modules/timer/locales/zh'
import timerTr from '@modules/timer/locales/tr'
import timerAr from '@modules/timer/locales/ar'
import timerHi from '@modules/timer/locales/hi'

import youtubePtBR from '@modules/youtube/locales/pt-BR'
import youtubeEn from '@modules/youtube/locales/en'
import youtubeEs from '@modules/youtube/locales/es'
import youtubeFr from '@modules/youtube/locales/fr'
import youtubeRu from '@modules/youtube/locales/ru'
import youtubeUk from '@modules/youtube/locales/uk'
import youtubeJa from '@modules/youtube/locales/ja'
import youtubeKo from '@modules/youtube/locales/ko'
import youtubeZh from '@modules/youtube/locales/zh'
import youtubeTr from '@modules/youtube/locales/tr'
import youtubeAr from '@modules/youtube/locales/ar'
import youtubeHi from '@modules/youtube/locales/hi'

/**
 * Coleta recursivamente todas as chaves (paths) de um objeto.
 * Ex: { a: { b: 1 } } -> ['a.b']
 */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys.sort()
}

const MODULE_SETS = {
  core: [ptBR, en, es, fr, ru, uk, ja, ko, zh, tr, ar, hi],
  albums: [albumsPtBR, albumsEn, albumsEs, albumsFr, albumsRu, albumsUk, albumsJa, albumsKo, albumsZh, albumsTr, albumsAr, albumsHi],
  announcements: [announcementsPtBR, announcementsEn, announcementsEs, announcementsFr, announcementsRu, announcementsUk, announcementsJa, announcementsKo, announcementsZh, announcementsTr, announcementsAr, announcementsHi],
  bible: [biblePtBR, bibleEn, bibleEs, bibleFr, bibleRu, bibleUk, bibleJa, bibleKo, bibleZh, bibleTr, bibleAr, bibleHi],
  clock: [clockPtBR, clockEn, clockEs, clockFr, clockRu, clockUk, clockJa, clockKo, clockZh, clockTr, clockAr, clockHi],
  community: [communityPtBR, communityEn, communityEs, communityFr, communityRu, communityUk, communityJa, communityKo, communityZh, communityTr, communityAr, communityHi],
  countdown: [countdownPtBR, countdownEn, countdownEs, countdownFr, countdownRu, countdownUk, countdownJa, countdownKo, countdownZh, countdownTr, countdownAr, countdownHi],
  home: [homePtBR, homeEn, homeEs, homeFr, homeRu, homeUk, homeJa, homeKo, homeZh, homeTr, homeAr, homeHi],
  liturgy: [liturgyPtBR, liturgyEn, liturgyEs, liturgyFr, liturgyRu, liturgyUk, liturgyJa, liturgyKo, liturgyZh, liturgyTr, liturgyAr, liturgyHi],
  media: [mediaPtBR, mediaEn, mediaEs, mediaFr, mediaRu, mediaUk, mediaJa, mediaKo, mediaZh, mediaTr, mediaAr, mediaHi],
  random: [randomPtBR, randomEn, randomEs, randomFr, randomRu, randomUk, randomJa, randomKo, randomZh, randomTr, randomAr, randomHi],
  'sabbath-school': [sabbathSchoolPtBR, sabbathSchoolEn, sabbathSchoolEs, sabbathSchoolFr, sabbathSchoolRu, sabbathSchoolUk, sabbathSchoolJa, sabbathSchoolKo, sabbathSchoolZh, sabbathSchoolTr, sabbathSchoolAr, sabbathSchoolHi],
  settings: [settingsPtBR, settingsEn, settingsEs, settingsFr, settingsRu, settingsUk, settingsJa, settingsKo, settingsZh, settingsTr, settingsAr, settingsHi],
  starting: [startingPtBR, startingEn, startingEs, startingFr, startingRu, startingUk, startingJa, startingKo, startingZh, startingTr, startingAr, startingHi],
  sync: [syncPtBR, syncEn, syncEs, syncFr, syncRu, syncUk, syncJa, syncKo, syncZh, syncTr, syncAr, syncHi],
  timer: [timerPtBR, timerEn, timerEs, timerFr, timerRu, timerUk, timerJa, timerKo, timerZh, timerTr, timerAr, timerHi],
  youtube: [youtubePtBR, youtubeEn, youtubeEs, youtubeFr, youtubeRu, youtubeUk, youtubeJa, youtubeKo, youtubeZh, youtubeTr, youtubeAr, youtubeHi],
} as Record<string, Record<string, unknown>[]>

const LOCALE_NAMES = ['pt-BR', 'en', 'es', 'fr', 'ru', 'uk', 'ja', 'ko', 'zh', 'tr', 'ar', 'hi']

// Paridade global: cada locale vs pt-BR (core + todos os módulos combinados)
const combined: Record<string, string[]> = {}
for (const sets of Object.values(MODULE_SETS)) {
  sets.forEach((set, i) => {
    const loc = LOCALE_NAMES[i]
    combined[loc] = (combined[loc] ?? []).concat(collectKeys(set))
  })
}
const baseline = combined['pt-BR']

for (const loc of LOCALE_NAMES.slice(1)) {
  describe(`Locale parity global: pt-BR (baseline) vs ${loc}`, () => {
    it(`${loc} tem exatamente as chaves de pt-BR (core + módulos)`, () => {
      const missing = baseline.filter((k) => !combined[loc].includes(k))
      const extra = combined[loc].filter((k) => !baseline.includes(k))
      if (missing.length > 0) console.error(`Faltando em ${loc}:`, missing)
      if (extra.length > 0) console.error(`Extras em ${loc}:`, extra)
      expect(missing).toEqual([])
      expect(extra).toEqual([])
    })
  })
}

// Paridade por módulo: cada locale vs o pt-BR do mesmo módulo
for (const [moduleName, sets] of Object.entries(MODULE_SETS)) {
  const base = collectKeys(sets[0])
  sets.slice(1).forEach((set, i) => {
    const keys = collectKeys(set)
    const loc = LOCALE_NAMES[i + 1]
    describe(`Locale parity: ${moduleName} — pt-BR vs ${loc}`, () => {
      it(`${loc} tem exatamente as chaves de pt-BR em ${moduleName}`, () => {
        const missing = base.filter((k) => !keys.includes(k))
        const extra = keys.filter((k) => !base.includes(k))
        if (missing.length > 0) console.error(`Faltando em ${loc}/${moduleName}:`, missing)
        if (extra.length > 0) console.error(`Extras em ${loc}/${moduleName}:`, extra)
        expect(missing).toEqual([])
        expect(extra).toEqual([])
      })
    })
  })
}
