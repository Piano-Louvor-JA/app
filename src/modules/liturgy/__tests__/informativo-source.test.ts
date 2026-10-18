import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  extractInformativoEpisode,
  informativoPostUrl,
  informativoUpcomingSaturdays,
  toISODateLocal,
} from '../services/informativo-source'

const fixture = readFileSync(
  join(process.cwd(), 'src/modules/liturgy/__tests__/fixtures/informativo-post.html'),
  'utf8',
)

describe('Informativo Mundial das Missões — post semanal', () => {
  it('extrai somente o primeiro embed YouTube como vídeo online', () => {
    expect(extractInformativoEpisode(fixture, '2026-10-10')).toEqual({
      dateISO: '2026-10-10',
      title: 'Informativo Mundial das Missões',
      url: 'https://www.youtube.com/watch?v=QpsaAiK1Dmg',
    })
  })

  it('não aceita post sem vídeo direto', () => {
    expect(extractInformativoEpisode('<article>sem embed</article>', '2026-10-10')).toBeNull()
  })

  it('extrai link watch?v= do markdown do proxy web (fallback r.jina.ai)', () => {
    const markdown =
      '![video](https://i0.wp.com/img.png) https://www.youtube.com/watch?v=CiBuNdqguD4 e depois https://www.youtube.com/watch?v=outroVid99'
    expect(extractInformativoEpisode(markdown, '2026-10-17')?.url).toBe(
      'https://www.youtube.com/watch?v=CiBuNdqguD4',
    )
  })
})

describe('B1: 13 sábados do trimestre (determinístico, sem rede)', () => {
  it('gera exatamente 13 datas, ordenadas, todas sábados, a partir da semana corrente', () => {
    const dates = informativoUpcomingSaturdays(new Date(2026, 9, 14), 13) // quarta, 14/10/2026
    expect(dates).toHaveLength(13)
    expect(dates[0]).toBe('2026-10-17')
    expect([...dates].sort()).toEqual(dates)
    for (const dateISO of dates) {
      const weekday = new Date(`${dateISO}T12:00:00`).getDay()
      expect(weekday).toBe(6)
    }
    expect(dates[12]).toBe('2027-01-09')
  })

  it('se hoje é sábado, a semana corrente entra (não pula)', () => {
    expect(informativoUpcomingSaturdays(new Date(2026, 9, 17), 1)).toEqual(['2026-10-17'])
  })

  it('monta URL determinística do post do Daniel Locutor', () => {
    expect(informativoPostUrl('2026-10-10')).toBe(
      'https://www.daniellocutor.com.br/2026/10/informativo-mundial-das-missoes-10-outubro-2026/',
    )
    expect(informativoPostUrl('2027-01-03')).toBe(
      'https://www.daniellocutor.com.br/2027/01/informativo-mundial-das-missoes-03-janeiro-2027/',
    )
  })
})

describe('datas locais (não UTC)', () => {
  it('formata componentes locais, sem serialização UTC', () => {
    expect(toISODateLocal(new Date(2026, 9, 24, 0, 0, 0))).toBe('2026-10-24')
  })
})
