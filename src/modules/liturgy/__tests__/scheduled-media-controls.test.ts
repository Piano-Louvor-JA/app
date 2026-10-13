import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const item = readFileSync(
  join(process.cwd(), 'src/modules/liturgy/components/LiturgyTimelineItem.vue'),
  'utf8',
)

describe('controles de mídia agendada', () => {
  it('mostra player e play quando o conteúdo resolvido é arquivo local', () => {
    expect(item).toContain('isScheduledLocalMedia')
    expect(item).toContain('showPlayerSelect')
    expect(item).toContain('watch(showPlayerSelect')
    expect(item).toContain('isScheduledLocalMedia.value')
  })
})
