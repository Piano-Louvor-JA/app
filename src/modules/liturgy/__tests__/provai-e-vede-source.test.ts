import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { extractProvaiEVedeEpisodes } from '../services/provai-e-vede-source'

const fixture = readFileSync(
  join(process.cwd(), 'src/modules/liturgy/__tests__/fixtures/provai-e-vede-page.html'),
  'utf-8',
)

describe('Provai e Vede — extrair episódios da página de downloads', () => {
  it('extrai episódios com data, título e URL (inclui nome com espaço)', () => {
    const episodes = extractProvaiEVedeEpisodes(fixture)
    expect(episodes.length).toBeGreaterThanOrEqual(13)

    const first = episodes.find((e) => e.dateISO === '2026-10-03')
    expect(first).toBeDefined()
    expect(first!.url).toContain('10-03-26_quem-chegou-a-igreja-aqui%20.mp4')
    expect(first!.title.toLowerCase()).toContain('igreja')

    const last = episodes.find((e) => e.dateISO === '2026-12-26')
    expect(last).toBeDefined()
    expect(last!.url).toContain('.mp4')
  })

  it('datas são ISO ordenadas e dentro do trimestre', () => {
    const episodes = extractProvaiEVedeEpisodes(fixture)
    const dates = episodes.map((e) => e.dateISO)
    expect([...dates].sort()).toEqual(dates)
    expect(dates[0]!).toBe('2026-10-03')
    expect(dates[dates.length - 1]!).toBe('2026-12-26')
  })
})
