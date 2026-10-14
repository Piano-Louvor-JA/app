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
    const parsed = JSON.parse(firstJson)
    expect(parsed.meta.keep).toBe('scalar')
    expect(parsed.triage.logs).toHaveLength(4)
    expect(parsed.triage.rendererErrors).toHaveLength(4)
    expect(parsed.triage.downloadFailures).toHaveLength(4)
  })

  it('nunca excede o budget nem devolve JSON inválido com meta estrutural gigante', () => {
    const oversized = {
      app: 'PIANO',
      version: '1.0.0',
      generatedAt: '2026-10-13T00:00:00.000Z',
      meta: { versao: '1.0.0', keep: 'scalar', huge: Array(400_000).fill(0) },
      triage: { logs: [], rendererErrors: [], downloadFailures: [] },
    }

    const json = serializeReportWithinBudget(oversized)
    const parsed = JSON.parse(json)

    expect(Buffer.byteLength(json)).toBeLessThan(DIAGNOSTICS_MAX_JSON_BYTES)
    expect(parsed).toEqual(expect.objectContaining({
      app: 'PIANO',
      version: '1.0.0',
      generatedAt: '2026-10-13T00:00:00.000Z',
      truncated: 'structural',
    }))
  })

  it('sempre devolve JSON parseável', () => {
    for (const value of [
      { meta: { nested: Array(400_000).fill({ value: 'x'.repeat(1024) }) } },
      { triage: { logs: Array(100).fill({ content: 'x'.repeat(10_000) }) } },
    ]) {
      expect(() => JSON.parse(serializeReportWithinBudget(value))).not.toThrow()
    }
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
