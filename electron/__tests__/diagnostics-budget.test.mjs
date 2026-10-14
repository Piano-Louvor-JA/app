import { describe, expect, it } from 'vitest'

import { DIAGNOSTICS_MAX_JSON_BYTES, serializeReportWithinBudget } from '../diagnostics.mjs'

function report() {
  return {
    meta: { versao: '1.0.0', keep: 'scalar' },
    triage: {
      logs: Array.from({ length: 4 }, (_, i) => ({ arquivo: `log-${i}`, conteudo: `${i}`.repeat(100_000) })),
      rendererErrors: Array.from({ length: 4 }, (_, i) => ({ message: `event-${i}`, stack: `stack-${i}`.repeat(30_000) })),
      downloadFailures: Array.from({ length: 4 }, (_, i) => ({ erro: `download-${i}`.repeat(30_000) })),
    },
  }
}

describe('serializeReportWithinBudget', () => {
  it('trunca em ordem determinística sem perder meta escalar', () => {
    const first = report()
    const second = report()
    const firstJson = serializeReportWithinBudget(first)
    const secondJson = serializeReportWithinBudget(second)

    expect(Buffer.byteLength(firstJson)).toBeLessThan(DIAGNOSTICS_MAX_JSON_BYTES)
    expect(firstJson).toBe(secondJson)
    expect(first.meta.keep).toBe('scalar')
    expect(first.triage.logs).toEqual([])
    expect(first.triage.rendererErrors).toEqual([])
    expect(first.triage.downloadFailures).not.toEqual([])
  })
})
