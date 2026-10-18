import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { extractInformativoEpisode } from '../services/informativo-source'

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
})
