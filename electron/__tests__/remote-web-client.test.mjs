// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const html = readFileSync(path.resolve('electron/remote-web.html'), 'utf8')
const source = readFileSync(path.resolve('electron/remote-web-client.js'), 'utf8')
class FakeSocket {
  static OPEN = 1
  static sockets = []
  readyState = 0
  sent = []
  constructor(url) { this.url = url; FakeSocket.sockets.push(this) }
  send(raw) { this.sent.push(JSON.parse(raw)) }
  close() { this.readyState = 3; this.onclose?.() }
  open() { this.readyState = 1; this.onopen?.() }
  receive(message) { this.onmessage?.({ data: JSON.stringify({ v: 1, ...message }) }) }
}
const element = id => document.getElementById(id)
beforeEach(() => {
  FakeSocket.sockets = []
  document.body.innerHTML = html.match(/<body>([\s\S]*?)<script/)[1]
  window.history.replaceState(null, '', '/control#token=TEST-CODE')
  vi.stubGlobal('WebSocket', FakeSocket)
  // Source statique du client, exécutée dans le DOM isolé du test.
  new Function(source)()
})
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); document.body.innerHTML = ''; window.history.replaceState(null, '', '/') })
function connect() {
  element('connect-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  const socket = FakeSocket.sockets.at(-1)
  socket.open()
  return socket
}
describe('Client navigateur du téléphone', () => {
  it('attend la confirmation du code avant d’activer les commandes', () => {
    expect(window.location.hash).toBe('')
    expect(element('token').value).toBe('TEST-CODE')
    const socket = connect()
    expect(socket.sent.at(-1)).toMatchObject({ type: 'command', action: 'liturgy.state', token: 'TEST-CODE' })
    expect(document.querySelector('[data-action]').disabled).toBe(true)
    socket.receive({ type: 'ack', ok: true })
    expect(document.querySelector('[data-action]').disabled).toBe(false)
    document.querySelector('[data-action="liturgy.next"]').click()
    expect(socket.sent.at(-1)).toMatchObject({ action: 'liturgy.next', token: 'TEST-CODE' })
  })
  it('affiche le programme sans interpréter les titres comme HTML', () => {
    const socket = connect()
    socket.receive({ type: 'ack', ok: true })
    socket.receive({ type: 'state', liturgy: { selectedIndex: 2, items: [{ index: 2, title: '<img src=x onerror=alert(1)>', responsible: 'Marie' }] }, player: { title: 'Cantique', volume: 60 } })
    expect(element('items').querySelector('img')).toBeNull()
    expect(element('items').textContent).toContain('<img src=x')
    element('items').querySelector('button').click()
    expect(socket.sent.at(-1)).toMatchObject({ action: 'liturgy.select', value: 2 })
    expect(element('volume').value).toBe('60')
  })
  it('désactive le contrôle lors d’une erreur et change la langue sans perdre l’état', () => {
    const socket = connect()
    socket.receive({ type: 'error', code: 'bad_token' })
    expect(document.querySelector('[data-action]').disabled).toBe(true)
    element('language').value = 'fr'
    element('language').dispatchEvent(new Event('change'))
    expect(element('status').textContent).toBe('Code incorrect.')
    expect(document.documentElement.lang).toBe('fr')
  })
})
