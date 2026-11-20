import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeMessage,
  sanitizeConnection,
  nextReconnectDelay,
  websocketUrl,
} from './protocol-harness.mjs'

test('accepts each required Palco v1/v2 message', () => {
  const cases = [
    ['projection', { text: 'Santo, Santo, Santo' }],
    ['bgPalco', { url: 'http://192.168.1.8:47080/media/bg.jpg?token=x' }],
    ['idle', { msg: 'Aguardando projeção' }],
    ['youare', { ip: '192.168.1.8', slot: 0, slotLabel: 'Palco' }],
    ['timer', { action: 'start', duration: 60_000, label: 'Oração' }],
    ['audio', { action: 'play', url: 'http://192.168.1.8:47080/media/a.mp3?token=x', positionMs: 900 }],
    ['video', { action: 'play', url: 'https://192.168.1.8:47080/media/v.mp4?token=x', position: 1000 }],
  ]
  for (const version of [1, 2]) {
    for (const [type, payload] of cases) {
      const result = normalizeMessage({ v: version, type, ...payload })
      assert.equal(result.type, type)
    }
  }
})

test('ignores malformed, unsupported and unsafe messages', () => {
  for (const message of [
    null,
    { v: 3, type: 'projection', text: 'x' },
    { v: 2, type: 'unknown' },
    { v: 2, type: 'audio', action: 'play', url: 'file:///secret.mp3' },
    { v: 2, type: 'video', action: 'play', url: 'data:video/mp4;base64,x' },
  ]) assert.equal(normalizeMessage(message), null)
})

test('connection config is validated and token stays out of display model', () => {
  assert.deepEqual(sanitizeConnection({ host: ' 192.168.1.8 ', wsPort: '47081', token: 'secret' }), {
    host: '192.168.1.8', wsPort: 47081, token: 'secret', valid: true,
  })
  assert.equal(sanitizeConnection({ host: '', wsPort: 47081, token: '' }).valid, false)
  assert.equal(sanitizeConnection({ host: 'tv', wsPort: 70000, token: '' }).valid, false)
  assert.equal(websocketUrl({ host: '192.168.1.8', wsPort: 47081, token: 'a b' }), 'ws://192.168.1.8:47081/palco?token=a%20b')
  assert.equal(websocketUrl({ host: 'tv.local', wsPort: 47081, token: '' }), 'ws://tv.local:47081/palco')
})

test('retry backoff is bounded and resettable', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 20].map(nextReconnectDelay), [1, 2, 4, 8, 15, 15, 15])
})
