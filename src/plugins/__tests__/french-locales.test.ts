import { describe, expect, it } from 'vitest'
import fr from '@locales/fr'
import en from '@locales/en'
import bibleFr from '@modules/bible/locales/fr'
import bibleEn from '@modules/bible/locales/en'
import homeFr from '@modules/home/locales/fr'
import homeEn from '@modules/home/locales/en'
import startingFr from '@modules/starting/locales/fr'
import startingEn from '@modules/starting/locales/en'
import catalog from '@locales/catalog'
import navigation from '@locales/navigation'
import study from '@locales/study'
import liturgyPlan from '@locales/liturgy-plan'
import remoteBrowser from '@locales/remote-browser'
import visualIdentity from '@locales/visual-identity'
import settingsFr from '@modules/settings/locales/fr'
import settingsEn from '@modules/settings/locales/en'
import liturgyFr from '@modules/liturgy/locales/fr'
import liturgyEn from '@modules/liturgy/locales/en'
import authFr from '@modules/auth/locales/fr'
import authEn from '@modules/auth/locales/en'
import albumsFr from '@modules/albums/locales/fr'
import albumsEn from '@modules/albums/locales/en'
import syncFr from '@modules/sync/locales/fr'
import syncEn from '@modules/sync/locales/en'

import clockFr from '@modules/clock/locales/fr'
import clockEn from '@modules/clock/locales/en'
import timerFr from '@modules/timer/locales/fr'
import timerEn from '@modules/timer/locales/en'
import countdownFr from '@modules/countdown/locales/fr'
import countdownEn from '@modules/countdown/locales/en'
import randomFr from '@modules/random/locales/fr'
import randomEn from '@modules/random/locales/en'
import mediaFr from '@modules/media/locales/fr'
import mediaEn from '@modules/media/locales/en'
import communityFr from '@modules/community/locales/fr'
import communityEn from '@modules/community/locales/en'

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => typeof child === 'string' ? [[prefix + key, child]] : Object.entries(flatten(child as Record<string, unknown>, `${prefix}${key}.`))))
}
describe('French translation coverage across the application', () => {
  it('covers every translated settings section without losing interpolation', () => {
    const actual = flatten(settingsFr)
    const expected = flatten(settingsEn)
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort())
    for (const [key, value] of Object.entries(actual)) {
      expect(expected[key], key).toBeDefined()
      expect(value.match(/\{\w+\}/g) ?? [], key).toEqual(expected[key]?.match(/\{\w+\}/g) ?? [])
    }
  })
  it.each([[visualIdentity.fr, visualIdentity.en], [visualIdentity.es, visualIdentity.en], [visualIdentity['pt-BR'], visualIdentity.en], [remoteBrowser.fr, remoteBrowser.en], [remoteBrowser.es, remoteBrowser.en], [remoteBrowser['pt-BR'], remoteBrowser.en], [study.fr, study.en], [study.es, study.en], [study['pt-BR'], study.en], [liturgyPlan.fr, liturgyPlan.en], [liturgyPlan.es, liturgyPlan.en], [liturgyPlan['pt-BR'], liturgyPlan.en], [clockFr, clockEn], [timerFr, timerEn], [countdownFr, countdownEn], [randomFr, randomEn], [mediaFr, mediaEn], [communityFr, communityEn], [navigation.fr, navigation.en], [navigation.es, navigation.en], [navigation['pt-BR'], navigation.en], [liturgyFr, liturgyEn], [authFr, authEn], [albumsFr, albumsEn], [syncFr, syncEn], [fr, en], [bibleFr, bibleEn], [homeFr, homeEn], [startingFr, startingEn], [catalog.fr, catalog.en], [catalog.es, catalog.en], [catalog['pt-BR'], catalog.en]])('preserves keys and interpolation variables', (translated, original) => {
    const actual = flatten(translated)
    const expected = flatten(original)
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort())
    for (const key of Object.keys(expected)) {
      expect(actual[key].match(/\{\w+\}/g) ?? []).toEqual(expected[key].match(/\{\w+\}/g) ?? [])
    }
  })
})
