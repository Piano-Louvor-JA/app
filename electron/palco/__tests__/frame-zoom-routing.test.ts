// @vitest-environment node
/** Zoom de imagem/PDF no Palco: a mensagem leve de zoom vai só para quem a
 * entende (avisou caps:['frameView']); o quadro recortado vai só para os
 * receivers antigos; quem reconecta recebe o quadro com o zoom atual. */
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => env.root },
  ipcMain: { handle: () => {} },
}))
// @ts-ignore Native runtime module.
import { PalcoSlot, setTransmissionState } from '../../palco-server.mjs'

env.root = mkdtempSync(path.join(tmpdir(), 'piano-frame-zoom-'))
afterAll(() => rmSync(env.root, { recursive: true, force: true }))
afterEach(() => setTransmissionState({ bind: 'all', requireToken: true }))

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

type Msg = Record<string, any>

async function connect(slot: any, caps?: string[]) {
  const received: Msg[] = []
  const ws = new WebSocket(`ws://127.0.0.1:${slot.wsPort}/palco`)
  ws.on('message', (raw) => received.push(JSON.parse(String(raw))))
  await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject) })
  if (caps) ws.send(JSON.stringify({ v: 2, type: 'caps', caps }))
  return { ws, received }
}

const frame = (extra: Msg = {}) => ({ v: 2, type: 'projection', frameSlide: true, background: 'data:image/png;base64,SU5U', text: '', footerRef: '', ...extra })

describe('zoom do quadro no palco', () => {
  it('frameView só para receivers novos; recorte só para os antigos; replay leva o zoom', async () => {
    setTransmissionState({ bind: 'all', requireToken: false })
    const slot = new PalcoSlot('zoom', 'Zoom', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const modern = await connect(slot, ['frameView'])
      const legacy = await connect(slot)
      // hello de TV também pode trazer caps
      const tv = await connect(slot)
      tv.ws.send(JSON.stringify({ v: 2, type: 'hello', role: 'tv', platform: 'androidtv', id: 'tv1', caps: ['frameView'] }))
      await expect.poll(() => slot.clientsCount).toBe(3)
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(slot.send(frame({ view: { zoom: 1, x: 0, y: 0 } }))).toBe(true)
      expect(slot.send({ v: 2, type: 'frameView', view: { zoom: 2, x: 0.1, y: 0, anim: 90 } })).toBe(true)
      expect(slot.send(frame({ background: 'data:image/png;base64,UkVD', legacyOnly: true }))).toBe(true)
      await new Promise(resolve => setTimeout(resolve, 100))

      const types = (list: Msg[]) => list.filter(m => m.type === 'projection' || m.type === 'frameView')
      expect(types(modern.received).map(m => m.type)).toEqual(['projection', 'frameView'])
      expect(types(tv.received).map(m => m.type)).toEqual(['projection', 'frameView'])
      expect(types(legacy.received).map(m => m.background ?? m.type)).toEqual(['data:image/png;base64,SU5U', 'data:image/png;base64,UkVD'])
      // o marcador interno não chega à TV
      expect(legacy.received.some(m => 'legacyOnly' in m)).toBe(false)

      // quem chega depois recebe a página inteira com o zoom atual (não o recorte)
      const late = await connect(slot)
      await expect.poll(() => late.received.find(m => m.type === 'projection')).toBeTruthy()
      expect(late.received.find(m => m.type === 'projection')).toMatchObject({ background: 'data:image/png;base64,SU5U', view: { zoom: 2, x: 0.1, y: 0, anim: 90 } })

      for (const c of [modern, legacy, tv, late]) c.ws.close()
    } finally { await slot.dispose() }
  }, 10000)

  it('aba de navegador com a página antiga recarrega uma vez; TVs e páginas atuais não', async () => {
    setTransmissionState({ bind: 'all', requireToken: false })
    const slot = new PalcoSlot('zoom-stale', 'Zoom', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const stale = await connect(slot)
      const modern = await connect(slot, ['frameView'])
      const overlay = await connect(slot, ['overlay'])
      const oldTv = await connect(slot)
      oldTv.ws.send(JSON.stringify({ v: 2, type: 'hello', role: 'tv', platform: 'webos', id: 'tv-old' }))
      await expect.poll(() => slot.clientsCount).toBe(4)
      await new Promise(resolve => setTimeout(resolve, 50))

      slot.send(frame())
      slot.send({ v: 2, type: 'frameView', view: { zoom: 2, x: 0, y: 0 } })
      slot.send({ v: 2, type: 'frameView', view: { zoom: 3, x: 0, y: 0 } })
      await new Promise(resolve => setTimeout(resolve, 100))

      const reloads = (list: Msg[]) => list.filter(m => m.type === 'obsControl' && m.action === 'reload')
      expect(reloads(stale.received)).toHaveLength(1)
      expect(reloads(modern.received)).toHaveLength(0)
      expect(reloads(overlay.received)).toHaveLength(0)
      expect(reloads(oldTv.received)).toHaveLength(0)
      for (const c of [stale, modern, overlay, oldTv]) c.ws.close()
    } finally { await slot.dispose() }
  }, 10000)

  it('cada aba informa a página (espelho, retorno, legenda); valor estranho é ignorado', async () => {
    setTransmissionState({ bind: 'all', requireToken: false })
    const slot = new PalcoSlot('pages', 'Pages', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const mirror = await connect(slot)
      mirror.ws.send(JSON.stringify({ v: 2, type: 'caps', caps: ['frameView'], page: 'espelho' }))
      const back = await connect(slot)
      back.ws.send(JSON.stringify({ v: 2, type: 'caps', caps: ['frameView'], page: 'retorno' }))
      const caption = await connect(slot)
      caption.ws.send(JSON.stringify({ v: 2, type: 'caps', caps: ['overlay'], page: 'legenda' }))
      const odd = await connect(slot)
      odd.ws.send(JSON.stringify({ v: 2, type: 'caps', caps: ['frameView'], page: '<script>' }))
      await expect.poll(() => slot.clients().filter((c: Msg) => c.page).length).toBe(3)
      expect(slot.clients().map((c: Msg) => c.page ?? null).sort()).toEqual(['espelho', 'legenda', 'retorno', null].sort())
      for (const c of [mirror, back, caption, odd]) c.ws.close()
    } finally { await slot.dispose() }
  }, 10000)

  it('envio para uma TV só respeita o que ela entende', async () => {
    setTransmissionState({ bind: 'all', requireToken: false })
    const slot = new PalcoSlot('zoom-uid', 'Zoom', await freePort(), await freePort(), () => null)
    try {
      await slot.start()
      const modern = await connect(slot, ['frameView'])
      const legacy = await connect(slot)
      await expect.poll(() => slot.clientsCount).toBe(2)
      await new Promise(resolve => setTimeout(resolve, 50))
      const [modernUid, legacyUid] = slot.clients().map((c: Msg) => c.uid)
      expect(slot.send({ v: 2, type: 'frameView', view: { zoom: 2, x: 0, y: 0 } }, modernUid)).toBe(true)
      expect(slot.send({ v: 2, type: 'frameView', view: { zoom: 2, x: 0, y: 0 } }, legacyUid)).toBe(false)
      expect(slot.send(frame({ legacyOnly: true }), legacyUid)).toBe(true)
      expect(slot.send(frame({ legacyOnly: true }), modernUid)).toBe(false)
      expect(slot.send({ v: 2, type: 'frameView', view: { zoom: 2 } }, 'ninguem')).toBe(false)
      expect(slot.send(frame({ legacyOnly: true }), 'ninguem')).toBe(false)
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(modern.received.filter(m => m.type === 'frameView')).toHaveLength(1)
      expect(legacy.received.filter(m => m.type === 'projection')).toHaveLength(1)
      modern.ws.close()
      legacy.ws.close()
    } finally { await slot.dispose() }
  }, 10000)
})
