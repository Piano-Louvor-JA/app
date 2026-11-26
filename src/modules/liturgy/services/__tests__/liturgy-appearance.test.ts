import { beforeEach, describe, expect, it } from 'vitest'

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { setUserPreference } from '@shared/services/user-preferences'

import {
  DEFAULT_LITURGY_APPEARANCE,
  liturgyTypeColor,
  loadLiturgyAppearance,
  normalizeLiturgyAppearance,
  saveLiturgyAppearance,
} from '../liturgy-appearance'

describe('aparência da lista da liturgia', () => {
  beforeEach(() => localStorage.clear())

  it('sem nada salvo, usa o padrão de hoje (esquerda, tamanho normal, negrito, com horário e subtítulo)', () => {
    expect(loadLiturgyAppearance()).toEqual(DEFAULT_LITURGY_APPEARANCE)
    expect(DEFAULT_LITURGY_APPEARANCE.category).toMatchObject({
      background: '',
      titleAlign: 'left',
      titleSize: 'md',
      bold: true,
      uppercase: false,
      titleColor: '',
      showTime: true,
      showSubtitle: true,
    })
    expect(DEFAULT_LITURGY_APPEARANCE.typeColors).toEqual({})
  })

  it('roundtrip: o que foi salvo sobrevive a recarregar', () => {
    const custom = {
      category: {
        background: '#1e3a5f',
        titleAlign: 'center' as const,
        titleSize: 'xl' as const,
        bold: false,
        uppercase: true,
        titleColor: '#ffd600',
        showTime: false,
        showSubtitle: false,
      },
      typeColors: { music: '#ff0000', online_video: '#00ff00' },
    }
    saveLiturgyAppearance(custom)
    expect(loadLiturgyAppearance()).toEqual(custom)
  })

  it('valores inválidos voltam ao padrão (cor, alinhamento, tamanho e tipo desconhecido)', () => {
    setUserPreference(USER_PREFERENCE_KEYS.liturgyAppearance, {
      category: { background: 'azul', titleAlign: 'right', titleSize: 'gigante', bold: 'sim', titleColor: '#FFF' },
      typeColors: { music: '#12ab34', naoExiste: '#ffffff', video: 'verde' },
    })
    const loaded = loadLiturgyAppearance()
    expect(loaded.category).toEqual({ ...DEFAULT_LITURGY_APPEARANCE.category, titleColor: '#ffffff' })
    expect(loaded.typeColors).toEqual({ music: '#12ab34' })
    expect(normalizeLiturgyAppearance(null)).toEqual(DEFAULT_LITURGY_APPEARANCE)
  })

  it('cor do tipo: a escolhida vale; sem escolha, a do próprio item', () => {
    const appearance = normalizeLiturgyAppearance({ typeColors: { music: '#ff0000' } })
    expect(liturgyTypeColor(appearance, 'music', '#00E676')).toBe('#ff0000')
    expect(liturgyTypeColor(appearance, 'video', '#00B8D4')).toBe('#00B8D4')
  })
})
