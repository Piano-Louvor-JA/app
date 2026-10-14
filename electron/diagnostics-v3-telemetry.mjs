/**
 * diag-v4-umbrella: telemetria volátil de sessão para o guard-chuva de diagnóstico.
 * Todos os coletores são best-effort e nunca lançam — falha individual não afeta o export.
 * Spec: Obsidian 01-Public/01-Projects/piano-app/diag-v4-umbrella/SPEC.md (frozen)
 */

const MAX_SAMPLES = 200
const MAX_TRANSITIONS = 10

export function createWsTelemetry(now = Date.now) {
  const startedAt = now()
  let connections = 0
  let drops = 0
  let lastDisconnect = null
  return {
    onConnection() {
      connections += 1
    },
    onDisconnect(reason) {
      drops += 1
      lastDisconnect = { reason: String(reason ?? 'unknown').slice(0, 128), tsISO: new Date().toISOString() }
    },
    snapshot() {
      return {
        connections,
        drops,
        lastDisconnect,
        uptimeMs: now() - startedAt,
      }
    },
  }
}

export function createLatencyAggregator() {
  const byHost = new Map()
  return {
    observe(host, ms) {
      const key = String(host ?? 'unknown')
      const cur = byHost.get(key) ?? { samples: [], lastMs: null }
      cur.lastMs = Number.isFinite(ms) ? ms : null
      if (Number.isFinite(ms)) {
        cur.samples.push(ms)
        if (cur.samples.length > MAX_SAMPLES) cur.samples.splice(0, cur.samples.length - MAX_SAMPLES)
      }
      byHost.set(key, cur)
    },
    snapshot() {
      const out = {}
      for (const [host, { samples, lastMs }] of byHost) {
        const sorted = [...samples].sort((a, b) => a - b)
        const pick = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null)
        out[host] = {
          count: sorted.length,
          lastMs,
          p50Ms: pick(50),
          p95Ms: pick(95),
        }
      }
      return out
    },
  }
}

export function computeClockSkewMs({ beforeWriteMs, afterWriteMs, mtimeMs }) {
  try {
    if (![beforeWriteMs, afterWriteMs, mtimeMs].every((n) => Number.isFinite(n))) return null
    const wroteAt = Math.round((Number(beforeWriteMs) + Number(afterWriteMs)) / 2)
    return Math.round(Number(mtimeMs) - wroteAt)
  } catch {
    return null
  }
}

export function createNetTransitionLog() {
  const entries = []
  return {
    record(type) {
      entries.push({ type: String(type ?? 'unknown').slice(0, 16), tsISO: new Date().toISOString() })
      if (entries.length > MAX_TRANSITIONS) entries.splice(0, entries.length - MAX_TRANSITIONS)
    },
    snapshot() {
      return [...entries]
    },
  }
}

export function sanitizeAudioDevices(raw) {
  try {
    if (!raw || typeof raw !== 'object') return null
    const devices = Number(raw.devices)
    const devicechangeCount = Number(raw.devicechangeCount)
    if (!Number.isFinite(devices) || !Number.isFinite(devicechangeCount)) return null
    // Só contagens: o nome do dispositivo (ex.: "AirPods de Fulano") pode
    // identificar a pessoa e o relatório pode ser enviado ao Glitchtip.
    return { devices, devicechangeCount }
  } catch {
    return null
  }
}

export function createChildProcessGone() {
  let count = 0
  let lastType = null
  let lastReason = null
  return {
    onGone(details) {
      if (!details || typeof details !== 'object') return
      count += 1
      lastType = typeof details.type === 'string' ? details.type.slice(0, 32) : null
      lastReason = typeof details.reason === 'string' ? details.reason.slice(0, 64) : null
    },
    snapshot() {
      return count ? { count, lastType, lastReason } : { count: 0, lastType: null, lastReason: null }
    },
  }
}

const JANK_THRESHOLD_MS = 100

// diag-v4b: jank medido no renderer (rAF) e enviado via IPC — main sanitiza e armazena.
export function sanitizeJank(raw) {
  try {
    if (!raw || typeof raw !== 'object') return null
    const sampledFrames = Number(raw.sampledFrames)
    const longFrames = Number(raw.longFrames)
    const worstFrameMs = Number(raw.worstFrameMs)
    if (![sampledFrames, longFrames].every((n) => Number.isFinite(n) && n >= 0)) return null
    return {
      sampledFrames: Math.min(Math.round(sampledFrames), 10_000_000),
      longFrames: Math.min(Math.round(longFrames), 10_000_000),
      worstFrameMs: Number.isFinite(worstFrameMs) && worstFrameMs > 0 ? Math.round(worstFrameMs) : null,
      thresholdMs: JANK_THRESHOLD_MS,
    }
  } catch {
    return null
  }
}

// diag-v4b: offset do relógio local vs servidor (header Date — resolução 1s).
export function computeNtpOffsetMs({ serverDateMs, localAtParseMs }) {
  try {
    if (![serverDateMs, localAtParseMs].every((n) => Number.isFinite(n))) return null
    return Math.round(Number(localAtParseMs) - Number(serverDateMs))
  } catch {
    return null
  }
}
