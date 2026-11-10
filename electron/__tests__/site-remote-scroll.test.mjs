// @vitest-environment node
/** Rolagem do celular espelhada no site projetado, pela proporção da página. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const main = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
const START = 'export function remoteScrollSource('
const END = 'export function registerProjectionCapturePermissions('

function load({ mode = 'site', destroyed = false } = {}) {
  const contents = { executeJavaScript: vi.fn(async () => true) }
  const context = {
    Number,
    Math,
    currentProjectionMode: mode,
    sourceWindow: { isDestroyed: () => destroyed, webContents: contents },
  }
  runInNewContext(main.slice(main.indexOf(START), main.indexOf(END)).replaceAll('export ', ''), context)
  return { context, contents }
}

it('rola a janela do site na mesma proporção do celular', () => {
  const { context, contents } = load()

  expect(context.remoteScrollSource(0.5)).toBe(true)
  const script = contents.executeJavaScript.mock.calls[0][0]
  expect(script).toContain('0.5')
  expect(script).toContain('scrollTo')
})

it('proporção fora de 0..1 é limitada', () => {
  const { context, contents } = load()

  context.remoteScrollSource(3)
  context.remoteScrollSource(-1)

  expect(contents.executeJavaScript.mock.calls[0][0]).toContain('const ratio = 1;')
  expect(contents.executeJavaScript.mock.calls[1][0]).toContain('const ratio = 0;')
})

it('valor que não é número ou sem site aberto não faz nada', () => {
  const { context, contents } = load()
  expect(context.remoteScrollSource('x')).toBe(false)
  expect(context.remoteScrollSource(Number.NaN)).toBe(false)
  expect(contents.executeJavaScript).not.toHaveBeenCalled()
  expect(load({ mode: 'pdf' }).context.remoteScrollSource(0.5)).toBe(false)
  expect(load({ destroyed: true }).context.remoteScrollSource(0.5)).toBe(false)
})
