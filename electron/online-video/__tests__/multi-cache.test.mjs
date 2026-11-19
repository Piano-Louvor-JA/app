// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CacheStore } from '../cache-store.mjs'
import { CUSTOM_SUBDIR, MultiCache, customVideosDir } from '../multi-cache.mjs'
import { OnlineVideoService, registerOnlineVideoIpc, settingsFromRecord } from '../ipc.mjs'

const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'
const GB = 1024 ** 3

let dir
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'piano-ov-multi-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Simula o que o gerenciador faz: grava o mp4 onde o cache manda e registra. */
async function download(cache, id, size = 100) {
  mkdirSync(path.dirname(cache.videoPath(id)), { recursive: true })
  writeFileSync(cache.videoPath(id), 'x')
  await cache.add(id, { size })
}

function stores() {
  const system = new CacheStore({ dir: path.join(dir, 'sys'), limitBytes: GB })
  const custom = new CacheStore({ dir: customVideosDir(path.join(dir, 'Meus vídeos')), limitBytes: GB })
  return { system, custom }
}

describe('MultiCache: pasta do sistema + pasta personalizada', () => {
  it('o protocolo pede pelo ID e recebe o arquivo com o título no nome', async () => {
    const { system, custom } = stores()
    const cache = new MultiCache({ system, custom, active: 'custom' })
    await cache.load()
    const title = 'Arautos do Rei | 60 Anos'
    writeFileSync(cache.videoPath(A, title), 'x')
    writeFileSync(cache.subtitlePath(A, title), 'WEBVTT')
    await cache.add(A, { title, size: 1, subtitleLang: 'pt' })
    expect(cache.fileFor(`${A}.mp4`)).toBe(path.join(custom.dir, `Arautos do Rei 60 Anos_${A}.mp4`))
    expect(cache.fileFor(`${A}.vtt`)).toBe(path.join(custom.dir, `Arautos do Rei 60 Anos_${A}.vtt`))
    expect(cache.fileFor('outro.txt')).toBe(path.join(custom.dir, 'outro.txt'))
  })

  it('a pasta personalizada usa uma subpasta própria', () => {
    expect(customVideosDir('/x/y')).toBe(path.join('/x/y', CUSTOM_SUBDIR))
  })

  it('downloads vão para a ativa; tocar acha o vídeo nas duas', async () => {
    const { system, custom } = stores()
    const cache = new MultiCache({ system, custom, active: 'system' })
    await cache.load()
    await download(cache, A, 100)
    expect(system.has(A)).toBe(true)

    cache.setActive('custom')
    expect(cache.dir).toBe(custom.dir)
    expect(cache.streamDir(B)).toBe(custom.streamDir(B))
    await download(cache, B, 300)
    expect(custom.has(B)).toBe(true)

    // Os dois continuam disponíveis, cada um na sua pasta.
    expect(cache.has(A) && cache.has(B)).toBe(true)
    expect(cache.videoPath(A)).toBe(system.videoPath(A))
    expect(cache.subtitlePath(B)).toBe(custom.subtitlePath(B))
    expect(cache.fileFor(`${A}.mp4`)).toBe(path.join(system.dir, `${A}.mp4`))
    expect(cache.fileFor(`${B}.vtt`)).toBe(path.join(custom.dir, `${B}.vtt`))
    expect(cache.get(A)?.size).toBe(100)
    expect(cache.get('ccccccccccc')).toBeNull()
    expect(cache.usage()).toEqual({ bytes: 400, count: 2, limitBytes: GB })
    expect(cache.folders()).toEqual({
      system: { dir: system.dir, bytes: 100, count: 1, limitBytes: GB },
      custom: { dir: custom.dir, bytes: 300, count: 1, limitBytes: GB },
      active: 'custom',
    })
    await cache.touch(A)
    await cache.touch('ccccccccccc')
  })

  it('manter, proteger, limite e apagar valem para as duas; apagar uma só', async () => {
    const { system, custom } = stores()
    const cache = new MultiCache({ system, custom })
    await cache.load()
    await download(cache, A)
    cache.setActive('custom')
    await download(cache, B)
    cache.protect(A)
    expect(system.protected.has(A) && custom.protected.has(A)).toBe(true)
    cache.unprotect(A)
    await cache.setKeep([A, B])
    expect(system.get(A)?.keep && custom.get(B)?.keep).toBe(true)
    await cache.setLimit(2 * GB)
    expect(custom.limitBytes).toBe(2 * GB)
    expect(await cache.enforceLimit()).toEqual([])
    await cache.save()

    await cache.clear('custom')
    expect(custom.has(B)).toBe(false)
    expect(system.has(A)).toBe(true)
    await cache.clear('system')
    expect(system.has(A)).toBe(false)
    await download(cache, B)
    await cache.remove(B)
    expect(cache.has(B)).toBe(false)
    await download(cache, B)
    expect((await cache.clear()).count).toBe(0)
  })

  it('sem pasta personalizada, a ativa "custom" cai na do sistema', async () => {
    const { system } = stores()
    const cache = new MultiCache({ system, active: 'custom' })
    expect(cache.activeStore).toBe(system)
    expect(cache.folders()).toMatchObject({ custom: null, active: 'system' })
    expect(cache.fileFor(`${A}.mp4`)).toBe(path.join(system.dir, `${A}.mp4`))
  })

  it('pasta personalizada inacessível sai sem derrubar a do sistema', async () => {
    const { system } = stores()
    const broken = { load: vi.fn(async () => { throw new Error('disco removido') }) }
    const cache = new MultiCache({ system, custom: broken, active: 'custom' })
    await cache.load()
    expect(cache.custom).toBeNull()
    expect(cache.activeStore).toBe(system)
  })

  it('nunca apaga os arquivos do operador na pasta escolhida', async () => {
    const chosen = path.join(dir, 'Vídeos')
    mkdirSync(chosen, { recursive: true })
    writeFileSync(path.join(chosen, 'casamento.mp4'), 'meu')
    const custom = new CacheStore({ dir: customVideosDir(chosen) })
    await custom.load()
    expect(existsSync(path.join(chosen, 'casamento.mp4'))).toBe(true)
  })
})

describe('OnlineVideoService com duas pastas', () => {
  const base = () => ({ userDataDir: dir, readRecord: () => ({ enabled: true }), writeRecord: vi.fn() })

  it('configuração: pasta personalizada só com caminho absoluto', () => {
    expect(settingsFromRecord({ folder: 'custom', customDir: 'relativa' })).toMatchObject({ folder: 'system', customDir: null })
    expect(settingsFromRecord({ folder: 'custom' })).toMatchObject({ folder: 'system', customDir: null })
    expect(settingsFromRecord({ folder: 'system', customDir: '/x' })).toMatchObject({ folder: 'system', customDir: '/x' })
  })

  it('escolher pasta: carrega, passa a baixar nela e mostra as duas no status', async () => {
    const chosen = path.join(dir, 'Externo')
    const writeRecord = vi.fn()
    const service = new OnlineVideoService({ ...base(), writeRecord, chooseDirectory: async () => chosen })
    await service.cache.load()
    const status = await service.chooseCustomFolder()
    expect(status.settings).toMatchObject({ folder: 'custom', customDir: chosen })
    expect(writeRecord).toHaveBeenLastCalledWith('online-video', expect.objectContaining({ folder: 'custom', customDir: chosen }))
    expect(status.cacheDir).toBe(customVideosDir(chosen))
    expect(status.folders).toMatchObject({ active: 'custom', system: { dir: path.join(dir, 'video-cache') }, custom: { dir: customVideosDir(chosen), count: 0 } })
    expect(existsSync(customVideosDir(chosen))).toBe(true)

    // Voltar para a do sistema mantém a personalizada (os vídeos dela continuam tocando).
    const back = await service.setSettings({ folder: 'system' })
    expect(back.folders).toMatchObject({ active: 'system', custom: { dir: customVideosDir(chosen) } })
    expect(service.cacheFile(`${A}.mp4`)).toBe(path.join(dir, 'video-cache', `${A}.mp4`))

    const openPath = vi.fn(async () => '')
    service.openPath = openPath
    expect(await service.openCacheFolder('custom')).toBe(true)
    expect(openPath).toHaveBeenCalledWith(customVideosDir(chosen))
    expect(await service.openCacheFolder('system')).toBe(true)
    expect((await service.clear('custom')).folders.custom.count).toBe(0)
    expect((await service.clear('outra')).usage.count).toBe(0)
  })

  it('várias janelas mandando a mesma pasta ao mesmo tempo: um leitor só, vídeos preservados', async () => {
    const chosen = path.join(dir, 'Externo')
    const videos = customVideosDir(chosen)
    mkdirSync(videos, { recursive: true })
    writeFileSync(path.join(videos, 'index.json'), JSON.stringify({ videos: { [A]: { title: 'Hino', size: 1 } } }))
    writeFileSync(path.join(videos, `${A}.mp4`), 'x')
    const service = new OnlineVideoService(base())
    await service.cache.load()
    const partial = { customDir: chosen, folder: 'custom' }
    await Promise.all([service.setSettings(partial), service.setSettings(partial), service.setSettings(partial)])
    expect(existsSync(path.join(videos, `Hino_${A}.mp4`))).toBe(true)
    expect(service.cache.has(A)).toBe(true)
    expect(service.cacheFile(`${A}.mp4`)).toBe(path.join(videos, `Hino_${A}.mp4`))
  })

  it('cancelar o seletor ou sem seletor não muda nada', async () => {
    const none = new OnlineVideoService(base())
    expect((await none.chooseCustomFolder()).settings.folder).toBe('system')
    const cancel = new OnlineVideoService({ ...base(), chooseDirectory: async () => null })
    expect((await cancel.chooseCustomFolder()).settings.customDir).toBeNull()
  })

  it('pasta salva que não abre mais volta para a do sistema', async () => {
    const file = path.join(dir, 'arquivo')
    writeFileSync(file, 'não é pasta')
    const writeRecord = vi.fn()
    const log = vi.fn()
    const service = new OnlineVideoService({ ...base(), writeRecord, log })
    const status = await service.setSettings({ customDir: file, folder: 'custom' })
    expect(status.settings).toMatchObject({ folder: 'system', customDir: null })
    expect(status.folders.custom).toBeNull()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('inacessível'))
  })

  it('pasta personalizada já salva é aberta no início; canal de IPC do seletor', async () => {
    const chosen = path.join(dir, 'Salva')
    const service = new OnlineVideoService({ ...base(), readRecord: () => ({ enabled: true, folder: 'custom', customDir: chosen }) })
    expect(service.cache.custom.dir).toBe(customVideosDir(chosen))
    expect(service.cache.dir).toBe(customVideosDir(chosen))

    const handlers = {}
    const fake = { chooseCustomFolder: vi.fn(async () => 'ok'), clear: vi.fn(), openCacheFolder: vi.fn() }
    registerOnlineVideoIpc({ handle: (channel, fn) => { handlers[channel] = fn } }, fake)
    expect(await handlers['online-video:choose-folder']()).toBe('ok')
    handlers['online-video:clear']({}, 'custom')
    expect(fake.clear).toHaveBeenCalledWith('custom')
    handlers['online-video:open-folder']({}, 'system')
    expect(fake.openCacheFolder).toHaveBeenCalledWith('system')
  })
})

describe('renomear um vídeo baixado', () => {
  it('renomeia na pasta que tem o vídeo, com a legenda; recusa o que está tocando', async () => {
    const service = new OnlineVideoService({ userDataDir: dir, readRecord: () => ({ enabled: true }), writeRecord: vi.fn(), chooseDirectory: async () => path.join(dir, 'Ext') })
    await service.cache.load()
    await service.chooseCustomFolder()
    const custom = service.cache.custom
    writeFileSync(custom.videoPath(A, 'Hino'), 'x')
    writeFileSync(custom.subtitlePath(A, 'Hino'), 'WEBVTT')
    await service.cache.add(A, { title: 'Hino', size: 1, subtitleLang: 'pt' })

    expect(await service.renameVideo(A, 'Culto de sábado / abertura')).toBe(`Culto de sabado abertura_${A}.mp4`)
    expect(existsSync(path.join(custom.dir, `Culto de sabado abertura_${A}.mp4`))).toBe(true)
    expect(existsSync(path.join(custom.dir, `Culto de sabado abertura_${A}.vtt`))).toBe(true)
    expect(existsSync(path.join(custom.dir, `Hino_${A}.mp4`))).toBe(false)
    expect(service.cacheFile(`${A}.mp4`)).toBe(path.join(custom.dir, `Culto de sabado abertura_${A}.mp4`))
    expect(service.videoStatus([A])[A]).toEqual({ state: 'ready', fileName: `Culto de sabado abertura_${A}.mp4` })
    expect(service.cache.get(A).title).toBe('Hino')

    // Mesmo nome: nada muda. Nome só com símbolos: fica só o ID.
    expect(await service.renameVideo(A, 'Culto de sabado abertura')).toBe(`Culto de sabado abertura_${A}.mp4`)
    expect(await service.renameVideo(A, '***')).toBe(`${A}.mp4`)

    // Depois de reabrir o app, o nome escolhido continua.
    expect(await service.renameVideo(A, 'Final')).toBe(`Final_${A}.mp4`)
    const reopened = new CacheStore({ dir: custom.dir })
    await reopened.load()
    expect(reopened.videoPath(A)).toBe(path.join(custom.dir, `Final_${A}.mp4`))
    expect(reopened.get(A).subtitleLang).toBe('pt')

    service.cache.protect(A)
    expect(await service.renameVideo(A, 'Outro')).toBeNull()
    service.cache.unprotect(A)
    expect(await service.renameVideo(B, 'Outro')).toBeNull()
    expect(await service.renameVideo(A, 5)).toBeNull()
    expect(await service.renameVideo(5, 'x')).toBeNull()
  })

  it('falha do disco vira null e vai para o log; legenda que some perde a legenda', async () => {
    const log = vi.fn()
    const service = new OnlineVideoService({ userDataDir: dir, readRecord: () => ({ enabled: true }), writeRecord: vi.fn(), log })
    await service.cache.load()
    const system = service.cache.system
    writeFileSync(system.videoPath(A, 'Hino'), 'x')
    await service.cache.add(A, { title: 'Hino', size: 1, subtitleLang: 'pt' })
    expect(await service.renameVideo(A, 'Novo')).toBe(`Novo_${A}.mp4`)
    expect(service.cache.get(A).subtitleLang).toBeNull()

    mkdirSync(path.join(system.dir, `Ocupado_${A}.mp4`, 'dentro'), { recursive: true })
    expect(await service.renameVideo(A, 'Ocupado')).toBeNull()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('não foi possível renomear'))
    expect(service.cache.videoPath(A)).toBe(path.join(system.dir, `Novo_${A}.mp4`))
  })

  it('cache sem rename e canal de IPC', async () => {
    const service = new OnlineVideoService({ userDataDir: dir, readRecord: () => null, writeRecord: vi.fn(), cache: { has: () => true } })
    expect(await service.renameVideo(A, 'x')).toBeNull()
    const handlers = {}
    const fake = { renameVideo: vi.fn(async () => 'n.mp4') }
    registerOnlineVideoIpc({ handle: (channel, fn) => { handlers[channel] = fn } }, fake)
    expect(await handlers['online-video:rename']({}, A, 'n')).toBe('n.mp4')
    expect(fake.renameVideo).toHaveBeenCalledWith(A, 'n')
    expect(await new MultiCache({ system: new CacheStore({ dir }) }).rename(A, 'x')).toBeNull()
  })
})

describe('lista dos baixados', () => {
  it('junta as duas pastas, mais recente primeiro, e marca o que foi renomeado', async () => {
    let clock = 1
    const now = () => clock++
    const system = new CacheStore({ dir: path.join(dir, 'sys'), now })
    const custom = new CacheStore({ dir: customVideosDir(path.join(dir, 'Ext')), now })
    const cache = new MultiCache({ system, custom, active: 'system' })
    await cache.load()
    writeFileSync(cache.videoPath(A, 'Hino A'), 'x')
    await cache.add(A, { title: 'Hino A', duration: 60, size: 10 })
    cache.setActive('custom')
    writeFileSync(cache.videoPath(B, 'Hino B'), 'x')
    await cache.add(B, { title: 'Hino B', duration: 90, size: 20 })
    await cache.rename(A, 'Abertura')

    const service = new OnlineVideoService({ userDataDir: dir, readRecord: () => null, writeRecord: vi.fn(), cache })
    expect(service.listDownloads()).toEqual([
      { id: B, title: 'Hino B', duration: 90, size: 20, lastUsed: 2, fileName: `Hino B_${B}.mp4`, renamed: false, folder: 'custom' },
      { id: A, title: 'Hino A', duration: 60, size: 10, lastUsed: 1, fileName: `Abertura_${A}.mp4`, renamed: true, folder: 'system' },
    ])
    expect(new OnlineVideoService({ userDataDir: dir, readRecord: () => null, writeRecord: vi.fn(), cache: {} }).listDownloads()).toEqual([])

    const handlers = {}
    registerOnlineVideoIpc({ handle: (channel, fn) => { handlers[channel] = fn } }, { listDownloads: () => ['ok'] })
    expect(handlers['online-video:list']()).toEqual(['ok'])
  })

  it('vídeo antigo só com o ID não conta como renomeado', async () => {
    writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ videos: { [A]: { title: '', size: 1, lastUsed: 1 } } }))
    writeFileSync(path.join(dir, `${A}.mp4`), 'x')
    const store = new CacheStore({ dir })
    await store.load()
    expect(store.list()).toMatchObject([{ fileName: `${A}.mp4`, renamed: false }])
  })
})

describe('apagar um vídeo baixado', () => {
  it('apaga de qualquer pasta; o que está tocando ou não existe fica', async () => {
    const service = new OnlineVideoService({ userDataDir: dir, readRecord: () => ({ enabled: true }), writeRecord: vi.fn(), chooseDirectory: async () => path.join(dir, 'Ext') })
    await service.cache.load()
    await download(service.cache, A)
    await service.chooseCustomFolder()
    await download(service.cache, B)
    expect(service.cache.custom.has(B)).toBe(true)

    service.cache.protect(A)
    expect(await service.removeVideo(A)).toBe(false)
    expect(service.cache.has(A)).toBe(true)
    service.cache.unprotect(A)

    expect(await service.removeVideo(A)).toBe(true)
    expect(await service.removeVideo(B)).toBe(true)
    expect(service.cache.has(A) || service.cache.has(B)).toBe(false)
    expect(await service.removeVideo(A)).toBe(false)
    expect(await service.removeVideo(5)).toBe(false)

    const handlers = {}
    const fake = { removeVideo: vi.fn(async () => true) }
    registerOnlineVideoIpc({ handle: (channel, fn) => { handlers[channel] = fn } }, fake)
    expect(await handlers['online-video:remove']({}, A)).toBe(true)
    expect(fake.removeVideo).toHaveBeenCalledWith(A)
  })
})
