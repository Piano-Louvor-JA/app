import { describe, expect, it } from 'vitest'

import {
  PROVAI_SOURCES_2026,
  resolveDefaultProvaiLanguage,
  resolveProvaiSource,
  type ProvaiQuarter,
  type ProvaiSourceLanguage,
} from '../services/provai-e-vede-catalog'

const PT_BASE = 'https://downloads.adventistas.org/pt/mordomia-crista/video'
const ES_BASE = 'https://downloads.adventistas.org/es/mayordomia-cristiana/video'

const EXPECTED: Record<ProvaiSourceLanguage, Record<ProvaiQuarter, string>> = {
  pt: {
    1: `${PT_BASE}/provai-e-vede-2026-1o-trimestre`,
    2: `${PT_BASE}/provai-e-vede-2026-2o-trimestre`,
    3: `${PT_BASE}/provai-e-vede-2026-3o-trimestre`,
    4: `${PT_BASE}/provai-e-vede-2026-4o-trimestre`,
  },
  es: {
    1: `${ES_BASE}/probad-y-ved-2026-1er-trimestre/`,
    2: `${ES_BASE}/probad-y-ved-2026-2do-2026-trimestre/`,
    3: `${ES_BASE}/probad-y-ved-2026-3do-2026-trimestre/`,
    4: `${ES_BASE}/probad-y-ved-2026-4er-2026-trimestre/`,
  },
}

const ROTATION_NAMES: Record<ProvaiSourceLanguage, string> = {
  pt: 'Provai e Vede',
  es: 'Probad y Ved',
}

describe('registry oficial Provai/Probad 2026 (RF-01)', () => {
  it.each([1, 2, 3, 4] as ProvaiQuarter[])('pt Q%i resolve URL exata da tabela', (quarter) => {
    const source = resolveProvaiSource({ language: 'pt', year: 2026, quarter })
    expect(source).toMatchObject({ language: 'pt', rotationName: 'Provai e Vede', url: EXPECTED.pt[quarter] })
  })

  it.each([1, 2, 3, 4] as ProvaiQuarter[])('es Q%i resolve URL exata (slugs irregulares literais)', (quarter) => {
    const source = resolveProvaiSource({ language: 'es', year: 2026, quarter })
    expect(source).toMatchObject({ language: 'es', rotationName: 'Probad y Ved', url: EXPECTED.es[quarter] })
  })

  it('registry fechado tem exatamente as 8 combinações', () => {
    expect(PROVAI_SOURCES_2026).toHaveLength(8)
    for (const s of PROVAI_SOURCES_2026) {
      expect(s.url).toBe(EXPECTED[s.language][s.quarter as ProvaiQuarter])
    }
  })

  it('ano 2027 e quarter inválido retornam null (sem URL inventada)', () => {
    expect(resolveProvaiSource({ language: 'pt', year: 2027, quarter: 4 })).toBeNull()
    expect(resolveProvaiSource({ language: 'es', year: 2026, quarter: 5 as ProvaiQuarter })).toBeNull()
    expect(resolveProvaiSource({ language: 'pt', year: 2026, quarter: 0 as ProvaiQuarter })).toBeNull()
  })
})

describe('default/fallback de idioma (RF-02)', () => {
  it.each([
    ['es', 'es'],
    ['es-AR', 'es'],
    ['es-MX', 'es'],
    ['pt-BR', 'pt'],
    ['pt', 'pt'],
    ['en', 'pt'],
    ['en-US', 'pt'],
    ['fr', 'pt'],
    ['', 'pt'],
    ['xx-YY', 'pt'],
  ])('locale %j → fonte %j', (locale, expected) => {
    expect(resolveDefaultProvaiLanguage(locale)).toBe(expected)
  })

  it('nenhuma fonte catalogada é en/fr', () => {
    for (const s of PROVAI_SOURCES_2026) {
      expect(['pt', 'es']).toContain(s.language)
    }
  })

  it('nomes de rotação acompanham a edição selecionada (ADR-03)', () => {
    expect(ROTATION_NAMES).toEqual({
      pt: 'Provai e Vede',
      es: 'Probad y Ved',
    })
  })
})
