import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLocalFont, resetFontLoader } from '../font-loader'
const face = { file: 'face-0.woff2', url: 'local://media/fontes/inter/face-0.woff2', weight: '400 800', unicodeRange: 'U+0000-00FF', bytes: 40, sha256: 'abc' }
const installed = { id: 'inter', family: 'Inter', version: 1, installedAt: '', faces: [face] }
const add = vi.fn()
const load = vi.fn(async function(this: unknown) { return this })
const list = vi.fn(async () => [installed])
beforeEach(() => {
  resetFontLoader()
  vi.clearAllMocks()
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add, ready: Promise.resolve() } })
  vi.stubGlobal('FontFace', class { load = load; constructor(..._args: unknown[]) {} })
  window.louvorja = { isElectron: true, fonts: { listInstalled: list } } as never
})
describe('local font loader', () => {
  it('registers local faces once per renderer and returns a safe CSS family', async () => {
    expect(await loadLocalFont('inter')).toContain('LouvorJA-inter')
    await loadLocalFont('inter')
    expect(add).toHaveBeenCalledTimes(1)
  })
  it('does not request any files for the bundled default', async () => {
    expect(await loadLocalFont(null)).toContain('Plus Jakarta Sans')
    expect(list).not.toHaveBeenCalled()
  })
  it('rejects missing fonts and failed loads, allowing caller to preserve its active font', async () => {
    list.mockResolvedValueOnce([])
    await expect(loadLocalFont('inter')).rejects.toThrow('font-missing')
    load.mockRejectedValueOnce(new Error('corrupt'))
    await expect(loadLocalFont('inter')).rejects.toThrow('corrupt')
    await expect(loadLocalFont('inter')).resolves.toContain('LouvorJA-inter')
  })
})
