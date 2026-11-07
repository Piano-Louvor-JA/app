// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { OnlineVideoManager } from '../manager.mjs'

const dirs = []
afterEach(() => {
  vi.unstubAllGlobals()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function harness(body) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'piano-subtitle-'))
  dirs.push(dir)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
  return { file: path.join(dir, 'aaaaaaaaaaa.vtt'), manager: new OnlineVideoManager({ tools: {}, cache: {} }) }
}
it('não grava conteúdo remoto que não seja legenda WebVTT', async () => {
  const { file, manager } = harness('<script>malicious()</script>')
  await expect(manager.downloadSubtitle('https://www.youtube.com/s', file)).rejects.toThrow('WebVTT')
  expect(existsSync(file)).toBe(false)
})
it('preserva legenda WebVTT válida em UTF-8', async () => {
  const text = 'WEBVTT\n\n00:00.000 --> 00:01.000\nLouvor\n'
  const { file, manager } = harness(text)
  await manager.downloadSubtitle('https://www.youtube.com/s', file)
  expect(readFileSync(file, 'utf8')).toBe(text)
})
