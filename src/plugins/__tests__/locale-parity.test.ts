// @vitest-environment node
import { describe, it, expect } from 'vitest'

import ptBR from '@locales/pt-BR'
import en from '@locales/en'
import es from '@locales/es'

import albumsPtBR from '@modules/albums/locales/pt-BR'
import albumsEn from '@modules/albums/locales/en'
import albumsEs from '@modules/albums/locales/es'

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
import youtubePtBR from '@modules/youtube/locales/pt-BR'
import youtubeEn from '@modules/youtube/locales/en'
import youtubeEs from '@modules/youtube/locales/es'

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

const ptBRMessages = {
  ...ptBR,
  ...albumsPtBR,
  ...biblePtBR,
  ...clockPtBR,
  ...countdownPtBR,
  ...homePtBR,
  ...liturgyPtBR,
  ...mediaPtBR,
  ...randomPtBR,
  ...youtubePtBR,
  ...settingsPtBR,
  ...startingPtBR,
  ...syncPtBR,
  ...timerPtBR,
}

const enMessages = {
  ...en,
  ...albumsEn,
  ...bibleEn,
  ...clockEn,
  ...countdownEn,
  ...homeEn,
  ...liturgyEn,
  ...mediaEn,
  ...randomEn,
  ...youtubeEn,
  ...settingsEn,
  ...startingEn,
  ...syncEn,
  ...timerEn,
}

const esMessages = {
  ...es,
  ...albumsEs,
  ...bibleEs,
  ...clockEs,
  ...countdownEs,
  ...homeEs,
  ...liturgyEs,
  ...mediaEs,
  ...randomEs,
  ...youtubeEs,
  ...settingsEs,
  ...startingEs,
  ...syncEs,
  ...timerEs,
}

const ptBRKeys = collectKeys(ptBRMessages)
const enKeys = collectKeys(enMessages)
const esKeys = collectKeys(esMessages)

describe('Locale parity: pt-BR (baseline) vs en', () => {
  it('en tem todas as chaves que existem em pt-BR', () => {
    const missing = ptBRKeys.filter((k) => !enKeys.includes(k))
    if (missing.length > 0) {
      console.error('Chaves faltando em EN:', missing)
    }
    expect(missing).toEqual([])
  })

  it('en nao tem chaves extras que nao existem em pt-BR', () => {
    const extra = enKeys.filter((k) => !ptBRKeys.includes(k))
    if (extra.length > 0) {
      console.error('Chaves extras em EN:', extra)
    }
    expect(extra).toEqual([])
  })
})

describe('Locale parity: pt-BR (baseline) vs es', () => {
  it('es tem todas as chaves que existem em pt-BR', () => {
    const missing = ptBRKeys.filter((k) => !esKeys.includes(k))
    if (missing.length > 0) {
      console.error('Chaves faltando em ES:', missing)
    }
    expect(missing).toEqual([])
  })

  it('es nao tem chaves extras que nao existem em pt-BR', () => {
    const extra = esKeys.filter((k) => !ptBRKeys.includes(k))
    if (extra.length > 0) {
      console.error('Chaves extras em ES:', extra)
    }
    expect(extra).toEqual([])
  })
})

describe('Locale parity: en vs es', () => {
  it('en e es tem o mesmo conjunto de chaves', () => {
    const missingInEs = enKeys.filter((k) => !esKeys.includes(k))
    const missingInEn = esKeys.filter((k) => !enKeys.includes(k))
    if (missingInEs.length > 0) console.error('Faltando em ES:', missingInEs)
    if (missingInEn.length > 0) console.error('Faltando em EN:', missingInEn)
    expect(missingInEs).toEqual([])
    expect(missingInEn).toEqual([])
  })
})
