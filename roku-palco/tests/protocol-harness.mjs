import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.resolve('components/Protocol.brs'), 'utf8')

export function normalizeMessage(message) {
  if (!message || (message.v !== 1 && message.v !== 2) || typeof message.type !== 'string') return null
  const type = message.type
  if (!['projection', 'bgPalco', 'idle', 'youare', 'timer', 'audio', 'video'].includes(type)) return null
  const media = type === 'audio' || type === 'video'
  if (media && message.url && !/^https?:\/\//i.test(message.url)) return null
  if (type === 'bgPalco' && message.url && !/^https?:\/\//i.test(message.url)) return null
  return { ...message, type }
}

export function sanitizeConnection({ host, wsPort, token }) {
  const normalizedHost = String(host ?? '').trim()
  const port = Number(wsPort)
  return {
    host: normalizedHost,
    wsPort: port,
    token: String(token ?? ''),
    valid: normalizedHost.length > 0 && Number.isInteger(port) && port >= 1 && port <= 65535,
  }
}

export function websocketUrl({ host, wsPort, token }) {
  const base = `ws://${host}:${wsPort}/palco`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

export function nextReconnectDelay(attempt) {
  return [1, 2, 4, 8, 15][Math.min(Math.max(0, attempt), 4)]
}

export const brightScriptProtocolSource = source
