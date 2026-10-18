// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(), getAppPath: vi.fn() },
}))

import { createBibleStore } from '../bible-store.mjs'

function bundle(versionId, chapters, extra = {}) {
  return {
    schema: 1,
    versionId,
    language: 'pt',
    name: `Versão ${versionId}`,
    abbreviation: `V${versionId}`,
    chapters,
    ...extra,
  }
}

function writeBundle(dir, versionId, data) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${versionId}.json.gz`), gzipSync(JSON.stringify(data)))
}

describe('bible-store', () => {
  let root
  let downloadDir
  let bundledDir
  let store

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'bible-store-'))
    downloadDir = path.join(root, 'userData', 'bible')
    bundledDir = path.join(root, 'resources', 'bible')
    store = createBibleStore({
      getSources: () => [
        { dir: downloadDir, source: 'download' },
        { dir: bundledDir, source: 'bundled' },
      ],
    })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('lê capítulo do bundle do instalador', async () => {
    writeBundle(bundledDir, 2, bundle(2, { 1: { 1: { 1: 'No princípio' } } }))
    await expect(store.getChapter(2, 1, 1)).resolves.toEqual({ 1: 'No princípio' })
  })

  it('bundle baixado (atualização) tem prioridade sobre o do instalador', async () => {
    writeBundle(bundledDir, 2, bundle(2, { 1: { 1: { 1: 'antigo' } } }))
    writeBundle(downloadDir, 2, bundle(2, { 1: { 1: { 1: 'novo' } } }))
    await expect(store.getChapter(2, 1, 1)).resolves.toEqual({ 1: 'novo' })
  })

  it('bundle baixado corrompido cai no do instalador', async () => {
    mkdirSync(downloadDir, { recursive: true })
    writeFileSync(path.join(downloadDir, '2.json.gz'), 'lixo')
    writeBundle(bundledDir, 2, bundle(2, { 1: { 1: { 1: 'instalador' } } }))
    await expect(store.getChapter(2, 1, 1)).resolves.toEqual({ 1: 'instalador' })
  })

  it('bundle de outra versão ou schema desconhecido é ignorado', async () => {
    writeBundle(downloadDir, 2, bundle(3, { 1: { 1: { 1: 'versão errada' } } }))
    writeBundle(bundledDir, 2, bundle(2, { 1: { 1: { 1: 'x' } } }, { schema: 99 }))
    await expect(store.getChapter(2, 1, 1)).resolves.toBeNull()
  })

  it('capítulo ou versão inexistente → null', async () => {
    writeBundle(bundledDir, 2, bundle(2, { 1: { 1: { 1: 'a' } } }))
    await expect(store.getChapter(2, 1, 9)).resolves.toBeNull()
    await expect(store.getChapter(2, 7, 1)).resolves.toBeNull()
    await expect(store.getChapter(5, 1, 1)).resolves.toBeNull()
  })

  it('parâmetros inválidos → null sem tocar no disco', async () => {
    await expect(store.getChapter('2/../x', 1, 1)).resolves.toBeNull()
    await expect(store.getChapter(2, -1, 1)).resolves.toBeNull()
    await expect(store.getChapter(2, 1, 1.5)).resolves.toBeNull()
  })

  it('carrega a versão uma vez só (leituras concorrentes compartilham)', async () => {
    writeBundle(bundledDir, 2, bundle(2, { 1: { 1: { 1: 'a' }, 2: { 1: 'b' } } }))
    const [a, b] = await Promise.all([store.getChapter(2, 1, 1), store.getChapter(2, 1, 2)])
    expect(a).toEqual({ 1: 'a' })
    expect(b).toEqual({ 1: 'b' })

    // Arquivo apagado depois de carregado: continua servindo da memória
    rmSync(path.join(bundledDir, '2.json.gz'))
    await expect(store.getChapter(2, 1, 1)).resolves.toEqual({ 1: 'a' })
  })

  it('invalidate(versionId) relê do disco', async () => {
    writeBundle(bundledDir, 2, bundle(2, { 1: { 1: { 1: 'v1' } } }))
    await store.getChapter(2, 1, 1)
    writeBundle(downloadDir, 2, bundle(2, { 1: { 1: { 1: 'v2' } } }))
    store.invalidate(2)
    await expect(store.getChapter(2, 1, 1)).resolves.toEqual({ 1: 'v2' })
  })

  it('mantém no máximo maxLoaded versões em memória', async () => {
    const small = createBibleStore({
      getSources: () => [{ dir: bundledDir, source: 'bundled' }],
      maxLoaded: 1,
    })
    writeBundle(bundledDir, 1, bundle(1, { 1: { 1: { 1: 'um' } } }))
    writeBundle(bundledDir, 2, bundle(2, { 1: { 1: { 1: 'dois' } } }))
    await small.getChapter(1, 1, 1)
    await small.getChapter(2, 1, 1)
    rmSync(path.join(bundledDir, '1.json.gz'))
    // versão 1 saiu da memória e o arquivo sumiu
    await expect(small.getChapter(1, 1, 1)).resolves.toBeNull()
    await expect(small.getChapter(2, 1, 1)).resolves.toEqual({ 1: 'dois' })
  })

  it('listVersions: uma entrada por versão, com a fonte vencedora', async () => {
    writeBundle(bundledDir, 2, bundle(2, {}))
    writeBundle(bundledDir, 10, bundle(10, {}))
    writeBundle(downloadDir, 2, bundle(2, {}))
    mkdirSync(bundledDir, { recursive: true })
    writeFileSync(path.join(bundledDir, 'manifest.json'), '{}')
    await expect(store.listVersions()).resolves.toEqual([
      { versionId: 2, source: 'download' },
      { versionId: 10, source: 'bundled' },
    ])
  })

  it('sem nenhuma pasta → listVersions vazio e getChapter null', async () => {
    await expect(store.listVersions()).resolves.toEqual([])
    await expect(store.getChapter(2, 1, 1)).resolves.toBeNull()
  })
})
