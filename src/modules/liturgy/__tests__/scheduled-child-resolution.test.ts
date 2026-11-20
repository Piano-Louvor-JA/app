import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const timeline = readFileSync(
  join(process.cwd(), 'src/modules/liturgy/components/LiturgyTimeline.vue'),
  'utf8',
)

describe('agendado dentro de categoria', () => {
  it('repassa a resolução para filho, não só para item raiz', () => {
    const childLoop = timeline.slice(timeline.indexOf('v-for="child in segment.children"'))
    expect(childLoop).toContain(':resolved-schedule="scheduledResolvedByItemId?.[child.item.id] ?? null"')
  })
})
