// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  createChildProcessGone,
  createLatencyAggregator,
  createNetTransitionLog,
  createWsTelemetry,
  computeClockSkewMs,
  sanitizeAudioDevices,
} from '../diagnostics-v3-telemetry.mjs'

describe('diag-v4-umbrella: telemetria volátil', () => {
  it('ws telemetry: conexão/drop/última desconexão/uptime', () => {
    const ws = createWsTelemetry()
    ws.onConnection()
    ws.onConnection()
    expect(ws.snapshot().connections).toBe(2)
    ws.onDisconnect('transport close')
    const snap = ws.snapshot()
    expect(snap.drops).toBe(1)
    expect(snap.lastDisconnect.reason).toBe('transport close')
    expect(snap.lastDisconnect.tsISO).toBeTruthy()
    expect(snap.uptimeMs).toBeGreaterThanOrEqual(0)
  })

  it('latency aggregator: p50/p95/count/last', () => {
    const agg = createLatencyAggregator()
    for (const ms of [10, 20, 30, 40, 200]) agg.observe('api-stg', ms)
    const snap = agg.snapshot()['api-stg']
    expect(snap.count).toBe(5)
    expect(snap.lastMs).toBe(200)
    expect(snap.p50Ms).toBe(30)
    expect(snap.p95Ms).toBeGreaterThanOrEqual(150)
  })

  it('latency aggregator: cap de amostras (sem leak)', () => {
    const agg = createLatencyAggregator()
    for (let i = 0; i < 500; i++) agg.observe('h', i)
    expect(agg.snapshot().h.count).toBeLessThanOrEqual(200)
  })

  it('clock skew: positivo = relógio adiantado', () => {
    const before = Date.now()
    const skew = computeClockSkewMs({ beforeWriteMs: before, afterWriteMs: before + 5, mtimeMs: before + 60_000 })
    expect(skew).toBeGreaterThan(50_000)
  })

  it('clock skew: arquivo sem mtime → null', () => {
    expect(computeClockSkewMs({ beforeWriteMs: 1, afterWriteMs: 2, mtimeMs: null })).toBeNull()
  })

  it('net transitions: últimos 10 com tipo+ts', () => {
    const log = createNetTransitionLog()
    for (let i = 0; i < 15; i++) log.record(i % 2 ? 'online' : 'offline')
    const snap = log.snapshot()
    expect(snap.length).toBe(10)
    expect(snap[0].type).toBeTruthy()
    expect(snap[0].tsISO).toBeTruthy()
  })

  it('audio devices: sanitiza labels e conta devicechange', () => {
    const snap = sanitizeAudioDevices({ devices: 3, devicechangeCount: 2, outputLabel: 'x'.repeat(200) })
    expect(snap.devices).toBe(3)
    expect(snap.devicechangeCount).toBe(2)
    expect(snap.outputLabel.length).toBeLessThanOrEqual(64)
  })

  it('audio devices: lixo → null, nunca lança', () => {
    expect(sanitizeAudioDevices(null)).toBeNull()
    expect(sanitizeAudioDevices('junk')).toBeNull()
  })

  it('child-process-gone: contagem+último tipo/motivo', () => {
    const gone = createChildProcessGone()
    gone.onGone({ type: 'GPU', reason: 'crashed' })
    gone.onGone({ type: 'Utility', reason: 'oom' })
    const snap = gone.snapshot()
    expect(snap.count).toBe(2)
    expect(snap.lastType).toBe('Utility')
    expect(snap.lastReason).toBe('oom')
  })
})
