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

  it('nunca excede o budget quando meta sozinha excede 300 KiB', () => {
    const oversized = {
      meta: { versao: '1.0.0', keep: 'scalar', huge: 'x'.repeat(400 * 1024) },
      triage: { logs: [], rendererErrors: [], downloadFailures: [] },
    }

    const json = serializeReportWithinBudget(oversized)
    const parsed = JSON.parse(json)

    expect(Buffer.byteLength(json)).toBeLessThan(DIAGNOSTICS_MAX_JSON_BYTES)
    expect(parsed.meta).toEqual(expect.objectContaining({ versao: '1.0.0', keep: 'scalar' }))
    expect(parsed.meta.huge).toBe('[redacted-blob]')
  })

  it('mascara JWT e blob base64 longo sem tocar em URL ou base64 curto', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature'
    const blob = 'a'.repeat(41)
    const json = serializeReportWithinBudget({
      meta: { message: `https://app.test/a abc123 ${jwt} ${blob}` },
    })

    expect(json).toContain('https://app.test/a')
    expect(json).toContain('abc123')
    expect(json).not.toContain(jwt)
    expect(json).not.toContain(blob)
  })
})
