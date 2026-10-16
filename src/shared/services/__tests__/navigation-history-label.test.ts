import { afterEach, describe, expect, it } from 'vitest'

import i18n, { SUPPORTED_LOCALES } from '@plugins/i18n'
import { mainNavRoutes } from '@shared/constants/navigation'

import {
  HISTORY_DETAIL_KEYS,
  HISTORY_NAV_KEYS,
  describeHistoryEntry,
} from '../navigation-history-label'

const t = (key: string) => i18n.global.t(key)

afterEach(() => {
  i18n.global.locale.value = 'pt-BR'
})

describe('describeHistoryEntry', () => {
  it('usa o label do dock pelo navKey', () => {
    expect(describeHistoryEntry({ fullPath: '/bible', name: 'bible', navKey: 'bible' }, t)).toBe('Bíblia')
  })

  it('acrescenta o detalhe da sub-rota quando existe', () => {
    expect(
      describeHistoryEntry(
        { fullPath: '/settings/projection', name: 'settings-projection', navKey: 'settings' },
        t,
      ),
    ).toBe('Configurações · Projeção & Telas')
    expect(
      describeHistoryEntry({ fullPath: '/utilities/clock', name: 'utilities-clock', navKey: 'utilities' }, t),
    ).toBe('Utilitários · Relógio')
    expect(describeHistoryEntry({ fullPath: '/media', name: 'media', navKey: 'albums' }, t)).toBe(
      'Central de Mídia · Player',
    )
  })

  it('rota sem detalhe fica só com o label do dock', () => {
    expect(describeHistoryEntry({ fullPath: '/utilities', name: 'utilities', navKey: 'utilities' }, t)).toBe(
      'Utilitários',
    )
    expect(describeHistoryEntry({ fullPath: '/x', name: null, navKey: 'liturgy' }, t)).toBe('Liturgia')
  })

  it('navKey desconhecido cai no Início', () => {
    expect(describeHistoryEntry({ fullPath: '/x', name: 'x', navKey: 'nao-existe' }, t)).toBe('Início')
  })

  it('segue o idioma ativo', () => {
    i18n.global.locale.value = 'en'
    expect(
      describeHistoryEntry({ fullPath: '/settings/remote', name: 'settings-remote', navKey: 'settings' }, t),
    ).toMatch(/ · /)
    expect(describeHistoryEntry({ fullPath: '/', name: 'home', navKey: 'home' }, t)).not.toBe('Início')
  })
})

describe('chaves i18n do histórico', () => {
  it('existem nos três idiomas', () => {
    const keys = [
      ...Object.values(HISTORY_NAV_KEYS),
      ...Object.values(HISTORY_DETAIL_KEYS),
      ...mainNavRoutes.map((item) => item.labelKey),
    ]
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of keys) {
        expect(i18n.global.te(key, locale), `${locale}: ${key}`).toBe(true)
      }
    }
  })

  it('cobre todas as sub-rotas nomeadas dos módulos', () => {
    expect(Object.keys(HISTORY_DETAIL_KEYS).sort()).toEqual(
      [
        'albums-collection',
        'community-ranking',
        'media',
        'media-editor',
        'settings-appearance',
        'settings-general',
        'settings-media',
        'settings-projection',
        'settings-remote',
        'utilities-clock',
        'utilities-countdown',
        'utilities-obs',
        'utilities-random',
        'utilities-temporizador',
        'utilities-timer',
      ].sort(),
    )
  })
})
