import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const item = readFileSync(
  join(process.cwd(), 'src/modules/liturgy/components/LiturgyTimelineItem.vue'),
  'utf8',
)

describe('duração de vídeo agendado', () => {
  it('consulta duração dinâmica do arquivo resolvido pelo IPC', () => {
    expect(item).toContain("from '../services/media-probe'")
    expect(item).toContain('probeMediaDurationMs')
    expect(item).toContain('scheduledDurationLabel')
  })
})
