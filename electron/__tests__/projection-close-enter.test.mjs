// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8')
const preload = readFileSync(new URL('../preload.mjs', import.meta.url), 'utf8')

const match = main.match(
  /childWindow\.webContents\.on\('before-input-event', \(event, input\) => \{\n([\s\S]*?)\n {6}\}\)/,
)

function press(key, { independent = false, type = 'keyDown', url = 'file:///app/index.html#/popup?module=bible' } = {}) {
  const send = vi.fn()
  const close = vi.fn()
  const preventDefault = vi.fn()
  runInNewContext(`(function(){${match[1]}\n})()`, {
    event: { preventDefault },
    input: { type, key },
    independent,
    parentWindow: { isDestroyed: () => false, webContents: { send } },
    childWindow: { close, webContents: { getURL: () => url } },
  })
  return { send, close, preventDefault }
}

describe('teclado da janela de projeção (Esc + Enter)', () => {
  it('encontra o handler da projeção no main', () => {
    expect(match).not.toBeNull()
  })

  it('Esc segue pedindo confirmação ao operador', () => {
    const { send, close } = press('Escape')
    expect(send).toHaveBeenCalledWith('projection:close-requested')
    expect(close).not.toHaveBeenCalled()
  })

  it('Enter é encaminhado ao operador para confirmar o encerramento', () => {
    const { send, preventDefault } = press('Enter')
    expect(send).toHaveBeenCalledWith('projection:confirm-close-requested')
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('Enter em projeção de mídia também é encaminhado', () => {
    const { send } = press('Enter', { url: 'file:///app/index.html#/popup?module=media' })
    expect(send).toHaveBeenCalledWith('projection:confirm-close-requested')
  })

  it('projeção independente: Esc fecha direto e Enter não é encaminhado', () => {
    expect(press('Escape', { independent: true }).close).toHaveBeenCalled()
    expect(press('Enter', { independent: true }).send).not.toHaveBeenCalled()
  })

  it('keyUp não encaminha nada', () => {
    expect(press('Enter', { type: 'keyUp' }).send).not.toHaveBeenCalled()
  })

  it('preload expõe o aviso de Enter ao renderer', () => {
    expect(preload).toMatch(
      /onConfirmCloseRequested: \(callback\) => subscribe\('projection:confirm-close-requested', callback\)/,
    )
  })
})
