// @vitest-environment node
/** Navegação do celular espelhada no site projetado: troca o endereço da janela de origem. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const main = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
const START = 'export function remoteNavigateSource('
const END = 'export function registerProjectionCapturePermissions('

function load({ mode = 'site', url = 'https://x.org/', destroyed = false } = {}) {
  const contents = { getURL: vi.fn(() => url), loadURL: vi.fn(async () => undefined) }
  const context = {
    URL,
    currentProjectionMode: mode,
    sourceWindow: { isDestroyed: () => destroyed, webContents: contents },
  }
  runInNewContext(main.slice(main.indexOf(START), main.indexOf(END)).replaceAll('export ', ''), context)
  return { context, contents }
}

it('abre o novo endereço no site projetado', () => {
  const { context, contents } = load()

  expect(context.remoteNavigateSource('https://x.org/imoveis')).toBe(true)
  expect(contents.loadURL).toHaveBeenCalledWith('https://x.org/imoveis')
})

it('mesmo endereço não recarrega a página', () => {
  const { context, contents } = load({ url: 'https://x.org/a' })

  expect(context.remoteNavigateSource('https://x.org/a')).toBe(true)
  expect(contents.loadURL).not.toHaveBeenCalled()
})

it('só aceita http e https', () => {
  const { context, contents } = load()

  expect(context.remoteNavigateSource('file:///etc/passwd')).toBe(false)
  expect(context.remoteNavigateSource('javascript:alert(1)')).toBe(false)
  expect(context.remoteNavigateSource('não é url')).toBe(false)
  expect(contents.loadURL).not.toHaveBeenCalled()
})

it('sem site aberto não faz nada', () => {
  expect(load({ mode: 'video' }).context.remoteNavigateSource('https://x.org/b')).toBe(false)
  expect(load({ destroyed: true }).context.remoteNavigateSource('https://x.org/b')).toBe(false)
})
