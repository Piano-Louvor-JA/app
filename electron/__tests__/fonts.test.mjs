// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, readdir, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createFontService, parseFontCss } from '../fonts/service.mjs'

const css = `/* latin-ext */
@font-face {font-style:normal; font-weight:400 800; src:url(https://fonts.gstatic.com/s/test/ext.woff2) format('woff2'); unicode-range:U+0100-02FF;}
/* latin */
@font-face {font-style:normal; font-weight:400 800; src:url(https://fonts.gstatic.com/s/test/latin.woff2) format('woff2'); unicode-range:U+0000-00FF;}`
const bytes = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(36)])
let root, fetcher, service
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'fonts-test-'))
  fetcher = vi.fn(async url => new Response(String(url).includes('googleapis') ? css : bytes))
  service = createFontService({ mediaRoot: () => root, fetch: fetcher })
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('offline font installation', () => {
  it('parses only latin subsets with weight and unicode-range', () => {
    const faces = parseFontCss(css)
    expect(faces).toHaveLength(2)
    expect(faces[0]).toMatchObject({ weight: '400 800', unicodeRange: 'U+0100-02FF' })
    expect(() => parseFontCss(css.replaceAll('https://fonts.gstatic.com', 'https://evil.test'))).toThrow()
  })
  it('atomically installs, lists local faces, and does not download twice', async () => {
    const result = await service.download('inter')
    expect(result.faces).toHaveLength(2)
    expect(result.faces[0].url).toMatch(/^local:\/\/media\/fontes\/inter\//)
    const calls = fetcher.mock.calls.length
    await service.download('inter')
    expect(fetcher).toHaveBeenCalledTimes(calls)
    expect((await service.list()).map(f => f.id)).toEqual(['inter'])
    expect(JSON.parse(await readFile(path.join(root, 'fontes/inter/manifest.json'), 'utf8')).version).toBe(1)
  })
  it('detects missing/corrupt faces, repairs on demand, rejects unsafe ids', async () => {
    await service.download('inter')
    await writeFile(path.join(root, 'fontes/inter/face-0.woff2'), 'broken')
    expect(await service.list()).toEqual([])
    await service.download('inter')
    expect(await service.list()).toHaveLength(1)
    await expect(service.download('../bad')).rejects.toThrow()
  })
  it('rejects a font face replaced by a symbolic link', async () => {
    await service.download('inter')
    const face = path.join(root, 'fontes/inter/face-0.woff2')
    const outside = path.join(root, 'outside.woff2')
    await writeFile(outside, bytes)
    await rm(face)
    await symlink(outside, face)
    expect(await service.list()).toEqual([])
  })
  it('cleans partial installation on failure and abort', async () => {
    fetcher.mockRejectedValueOnce(new Error('offline'))
    await expect(service.download('inter')).rejects.toThrow('offline')
    expect(await service.list()).toEqual([])
    const abort = new AbortController()
    abort.abort()
    await expect(service.download('inter', { signal: abort.signal })).rejects.toThrow()
    expect((await readdir(path.join(root, 'fontes'))).filter(n => n.startsWith('.'))).toEqual([])
  })
  it('serializes simultaneous downloads and keeps previews out of installed list', async () => {
    await Promise.all([service.download('inter'), service.download('inter')])
    expect(fetcher).toHaveBeenCalledTimes(3)
    await service.preview('lora')
    expect((await service.list()).map(f => f.id)).toEqual(['inter'])
  })
  it('refuses removal of referenced families even when called directly', async () => {
    service = createFontService({ mediaRoot: () => root, fetch: fetcher, referencedIds: async () => ['inter'] })
    await service.download('inter')
    await expect(service.remove('inter')).rejects.toThrow('in-use')
    expect(await service.list()).toHaveLength(1)
  })
  it('rejects non-WOFF2 and never publishes a manifest for it', async () => {
    fetcher.mockImplementation(async url => new Response(String(url).includes('googleapis') ? css : 'html error'))
    await expect(service.download('inter')).rejects.toThrow()
    expect(await service.list()).toEqual([])
  })
  it('aborts an actual in-flight request and removes staging files', async () => {
    let started
    const ready = new Promise(resolve => { started = resolve })
    fetcher.mockImplementation(async (url, options) => {
      if (String(url).includes('googleapis')) return new Response(css)
      started()
      return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }))
    })
    const controller = new AbortController()
    const download = service.download('inter', { signal: controller.signal })
    const assertion = expect(download).rejects.toThrow()
    await ready
    controller.abort()
    await assertion
    expect(await service.list()).toEqual([])
    expect((await readdir(path.join(root, 'fontes'))).filter(n => n.startsWith('.partial-'))).toEqual([])
  })
  it('rejects redirects to other hosts before requesting their bytes', async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://example.com/font.css' } }))
    await expect(service.download('inter')).rejects.toThrow('invalid-font-url')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('protects a font between preparation and preference commit', async () => {
    service.pin('inter', 'window-1-apply')
    await service.download('inter')
    await expect(service.remove('inter')).rejects.toThrow('font-in-use')
    service.unpin('window-1-apply')
    await service.remove('inter')
    expect(await service.list()).toEqual([])
  })

})
