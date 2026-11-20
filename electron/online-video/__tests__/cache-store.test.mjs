// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CacheStore, DEFAULT_CACHE_LIMIT_BYTES } from '../cache-store.mjs'

const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'
const C = 'ccccccccccc'

let dir
let clock
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'piano-cache-'))
  clock = 1_000
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const make = (limitBytes = 1000) => new CacheStore({ dir, limitBytes, now: () => clock })

/** Simula a montagem: grava o .mp4 (e a legenda) e registra no índice. */
async function addVideo(store, id, size, extra = {}) {
  const title = extra.title ?? `t-${id}`
  writeFileSync(store.videoPath(id, title), Buffer.alloc(size))
  if (extra.subtitleLang) writeFileSync(store.subtitlePath(id, title), 'WEBVTT')
  clock += 1
  await store.add(id, { title, duration: 60, height: 720, size, ...extra })
}

const index = () => JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'))

describe('CacheStore', () => {
  it('limite padrão de 6 GB e caminhos por ID', () => {
    const store = new CacheStore({ dir })
    expect(store.limitBytes).toBe(DEFAULT_CACHE_LIMIT_BYTES)
    expect(DEFAULT_CACHE_LIMIT_BYTES).toBe(6 * 1024 ** 3)
    expect(store.videoPath(A)).toBe(path.join(dir, `${A}.mp4`))
    expect(store.subtitlePath(A)).toBe(path.join(dir, `${A}.vtt`))
    expect(store.streamDir(A)).toBe(path.join(dir, '.stream', A))
  })

  it('add registra metadados, grava o índice e soma o uso', async () => {
    const store = make()
    await store.load()
    await addVideo(store, A, 300, { subtitleLang: 'pt' })
    expect(store.has(A)).toBe(true)
    expect(store.get(A)).toEqual({ title: `t-${A}`, duration: 60, height: 720, size: 300, lastUsed: clock, keep: false, subtitleLang: 'pt', file: `t ${A}_${A}` })
    expect(existsSync(path.join(dir, `t ${A}_${A}.mp4`))).toBe(true)
    expect(existsSync(path.join(dir, `t ${A}_${A}.vtt`))).toBe(true)
    expect(store.get(B)).toBeNull()
    expect(store.has(B)).toBe(false)
    expect(store.usage()).toEqual({ bytes: 300, count: 1, limitBytes: 1000 })
    expect(index()).toMatchObject({ version: 1, keepIds: [], videos: { [A]: { size: 300 } } })
  })

  it('add aceita metadados mínimos', async () => {
    const store = make()
    writeFileSync(store.videoPath(A), 'x')
    await store.add(A, { size: 1 })
    expect(store.get(A)).toMatchObject({ title: '', duration: 0, height: 0, subtitleLang: null })
  })

  it('acima do limite descarta o de uso mais antigo, junto com a legenda', async () => {
    const store = make()
    await addVideo(store, A, 400, { subtitleLang: 'pt' })
    await addVideo(store, B, 400)
    clock += 1
    await store.touch(A)
    await addVideo(store, C, 400)
    expect(store.has(B)).toBe(false)
    expect(existsSync(store.videoPath(B))).toBe(false)
    expect(store.has(A)).toBe(true)
    expect(existsSync(store.subtitlePath(A))).toBe(true)
    expect(store.usage().bytes).toBe(800)
  })

  it('nunca descarta vídeo marcado para manter nem o que está em uso', async () => {
    const store = make()
    await addVideo(store, A, 400)
    await addVideo(store, B, 400)
    await store.setKeep([A, 'invalido'])
    store.protect(B)
    await addVideo(store, C, 400)
    expect(store.has(A) && store.has(B)).toBe(true)
    expect(store.has(C)).toBe(false)
    expect(store.get(A).keep).toBe(true)
    expect(index().keepIds).toEqual([A])

    store.unprotect(B)
    await addVideo(store, C, 400)
    expect(store.has(B)).toBe(false)
    expect(store.has(C)).toBe(true)
  })

  it('vídeo que chega depois de marcado já entra como manter; desmarcar libera', async () => {
    const store = make()
    await store.setKeep([A])
    await addVideo(store, A, 600)
    expect(store.get(A).keep).toBe(true)
    await addVideo(store, B, 600)
    expect(store.has(A)).toBe(true)
    expect(store.has(B)).toBe(false)

    await addVideo(store, B, 300)
    await store.setKeep([])
    expect(store.get(A).keep).toBe(false)
    await store.setLimit(500)
    expect(store.has(A)).toBe(false)
    expect(store.has(B)).toBe(true)
  })

  it('touch atualiza o último uso; ID desconhecido é ignorado', async () => {
    const store = make()
    await addVideo(store, A, 10)
    clock = 9_999
    await store.touch(A)
    await store.touch(B)
    expect(store.get(A).lastUsed).toBe(9_999)
  })

  it('remove apaga os arquivos e a entrada; clear poupa o que está em uso', async () => {
    const store = make()
    await addVideo(store, A, 10, { subtitleLang: 'en' })
    await addVideo(store, B, 10)
    await addVideo(store, C, 10)
    await store.remove(A)
    await store.remove(A)
    expect(existsSync(store.subtitlePath(A))).toBe(false)
    store.protect(C)
    expect(await store.clear()).toEqual({ bytes: 10, count: 1, limitBytes: 1000 })
    expect(store.has(B)).toBe(false)
    expect(store.has(C)).toBe(true)
  })

  it('load: retoma o índice e arruma a pasta', async () => {
    const first = make()
    await first.load()
    await addVideo(first, A, 10, { subtitleLang: 'pt' })
    await first.setKeep([A])

    mkdirSync(path.join(dir, '.stream', B), { recursive: true })
    writeFileSync(path.join(dir, '.stream', B, 'video'), 'x')
    writeFileSync(path.join(dir, `${C}.mp4`), 'orfao')
    writeFileSync(path.join(dir, 'lixo.txt'), 'x')
    const oldTemp = path.join(dir, `.mux-${B}.mp4`)
    const newTemp = path.join(dir, `.mux-${C}.mp4`)
    writeFileSync(oldTemp, 'x')
    writeFileSync(newTemp, 'x')
    const twoDaysAgo = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000
    utimesSync(oldTemp, twoDaysAgo, twoDaysAgo)

    const second = new CacheStore({ dir, limitBytes: 1000 })
    expect(await second.load()).toEqual({ bytes: 10, count: 1, limitBytes: 1000 })
    expect(second.get(A)).toMatchObject({ keep: true, subtitleLang: 'pt' })
    expect(second.keepIds).toEqual(new Set([A]))
    expect(readdirSync(dir).sort()).toEqual([`.mux-${C}.mp4`, `t ${A}_${A}.mp4`, `t ${A}_${A}.vtt`, 'index.json'].sort())
  })

  it('load: descarta do índice o vídeo que sumiu do disco e entradas inválidas', async () => {
    writeFileSync(path.join(dir, 'index.json'), JSON.stringify({
      keepIds: [A, 'x'],
      videos: { [A]: { size: 5 }, [B]: { size: 5 }, curto: { size: 1 }, [C]: null },
    }))
    writeFileSync(path.join(dir, `${A}.mp4`), 'x')
    writeFileSync(path.join(dir, `${C}.mp4`), 'x')
    const store = make()
    await store.load()
    expect(Object.keys(store.videos)).toEqual([A])
    expect(store.keepIds).toEqual(new Set([A]))
    expect(existsSync(path.join(dir, `${C}.mp4`))).toBe(false)
  })

  it('load: renomeia vídeos antigos (só ID) para título_ID, com a legenda', async () => {
    writeFileSync(path.join(dir, 'index.json'), JSON.stringify({
      videos: {
        [A]: { title: 'Ês o ar | Adoradores', size: 1, subtitleLang: 'pt' },
        [B]: { title: '!!!', size: 1 },
        [C]: { title: 'Sem legenda no disco', size: 1, subtitleLang: 'en' },
      },
    }))
    writeFileSync(path.join(dir, `${A}.mp4`), 'x')
    writeFileSync(path.join(dir, `${A}.vtt`), 'WEBVTT')
    writeFileSync(path.join(dir, `${B}.mp4`), 'x')
    writeFileSync(path.join(dir, `${C}.mp4`), 'x')
    const store = make()
    await store.load()
    expect(readdirSync(dir).sort()).toEqual([
      `${B}.mp4`, `Es o ar Adoradores_${A}.mp4`, `Es o ar Adoradores_${A}.vtt`,
      `Sem legenda no disco_${C}.mp4`, 'index.json',
    ].sort())
    expect(store.videoPath(A)).toBe(path.join(dir, `Es o ar Adoradores_${A}.mp4`))
    expect(store.get(C).subtitleLang).toBeNull()
    expect(index().videos[A].file).toBe(`Es o ar Adoradores_${A}`)

    const again = make()
    await again.load()
    expect(again.has(A) && again.has(B) && again.has(C)).toBe(true)
  })

  it('load: dois leitores da mesma pasta ao mesmo tempo não apagam os vídeos renomeados', async () => {
    writeFileSync(path.join(dir, 'index.json'), JSON.stringify({
      videos: { [A]: { title: 'Hino A', size: 1 }, [B]: { title: 'Hino B', size: 1, subtitleLang: 'pt' } },
    }))
    writeFileSync(path.join(dir, `${A}.mp4`), 'x')
    writeFileSync(path.join(dir, `${B}.mp4`), 'x')
    writeFileSync(path.join(dir, `${B}.vtt`), 'WEBVTT')
    const first = make()
    const second = make()
    await Promise.all([first.load(), second.load(), make().load()])
    expect(readdirSync(dir).sort()).toEqual([`Hino A_${A}.mp4`, `Hino B_${B}.mp4`, `Hino B_${B}.vtt`, 'index.json'].sort())
    expect(second.has(A) && second.has(B)).toBe(true)
    expect(index().videos[A].file).toBe(`Hino A_${A}`)
  })

  it('load: vídeo antigo que não dá para renomear continua com o nome antigo', async () => {
    writeFileSync(path.join(dir, 'index.json'), JSON.stringify({
      videos: { [A]: { title: 'Hino', size: 1 }, [B]: { title: 'Outro', size: 1 } },
    }))
    writeFileSync(path.join(dir, `${A}.mp4`), 'x')
    writeFileSync(path.join(dir, `${B}.mp4`), 'x')
    mkdirSync(path.join(dir, `Hino_${A}.mp4`, 'ocupado'), { recursive: true })
    const store = make()
    await store.load()
    expect(store.has(A)).toBe(true)
    expect(store.videoPath(A)).toBe(path.join(dir, `${A}.mp4`))
    expect(store.videoPath(B)).toBe(path.join(dir, `Outro_${B}.mp4`))
  })

  it('load: reconhece o vídeo com outro nome em vez de apagar', async () => {
    writeFileSync(path.join(dir, 'index.json'), JSON.stringify({
      videos: { [A]: { title: 'Hino', size: 1, file: `Hino_${A}` }, [B]: { title: 'Outro', size: 1 } },
    }))
    writeFileSync(path.join(dir, `Nome que o operador deu_${A}.mp4`), 'x')
    writeFileSync(path.join(dir, `Outro_${B}.mp4`), 'x')
    writeFileSync(path.join(dir, `Ruim!_${C}.mp4`), 'x')
    writeFileSync(path.join(dir, `${C}.txt`), 'x')
    const store = make()
    await store.load()
    expect(store.videoPath(A)).toBe(path.join(dir, `Nome que o operador deu_${A}.mp4`))
    expect(store.videoPath(B)).toBe(path.join(dir, `Outro_${B}.mp4`))
    expect(store.has(C)).toBe(false)
  })

  it('load: nome inválido no índice volta para o ID', async () => {
    writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ videos: { [A]: { title: '', size: 1, file: '../fora' } } }))
    writeFileSync(path.join(dir, `${A}.mp4`), 'x')
    const store = make()
    await store.load()
    expect(store.videoPath(A)).toBe(path.join(dir, `${A}.mp4`))
    expect(store.get(A).file).toBeUndefined()
  })

  it('load: índice corrompido, nulo ou sem campos começa vazio', async () => {
    writeFileSync(path.join(dir, 'index.json'), '{quebrado')
    expect((await make().load()).count).toBe(0)
    writeFileSync(path.join(dir, 'index.json'), 'null')
    expect((await make().load()).count).toBe(0)
    writeFileSync(path.join(dir, 'index.json'), '{"keepIds":"x"}')
    const store = make()
    await store.load()
    expect(store.keepIds.size).toBe(0)
  })

  it('load cria a pasta quando ela não existe', async () => {
    const store = new CacheStore({ dir: path.join(dir, 'novo', 'cache') })
    expect((await store.load()).count).toBe(0)
    expect(existsSync(path.join(dir, 'novo', 'cache', 'index.json'))).toBe(true)
  })

  it('gravações simultâneas terminam com o estado mais novo', async () => {
    const store = make()
    writeFileSync(store.videoPath(A), 'x')
    writeFileSync(store.videoPath(B), 'x')
    await Promise.all([store.add(A, { size: 1 }), store.add(B, { size: 1 })])
    expect(Object.keys(index().videos).sort()).toEqual([A, B])
  })
})
