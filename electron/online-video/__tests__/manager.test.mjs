// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheStore } from '../cache-store.mjs'
import { CACHE_URL_BASE, OnlineVideoManager, STREAM_URL_BASE } from '../manager.mjs'
import { Track } from '../progressive.mjs'
import { OnlineVideoError } from '../resolver.mjs'

const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'

function payload(size, seed) {
  const buf = Buffer.alloc(size)
  for (let i = 0; i < size; i++) buf[i] = (i + seed) % 251
  return buf
}

const CDN = {
  'https://v.googlevideo.com/v': payload(5000, 1),
  'https://v.googlevideo.com/a': payload(3000, 7),
}

const info = (id = A, over = {}) => ({
  id,
  title: `Hino ${id}`,
  duration: 60,
  height: 720,
  availableAt: 0,
  video: { url: 'https://v.googlevideo.com/v', size: 5000, ext: 'mp4' },
  audio: { url: 'https://v.googlevideo.com/a', size: 3000, ext: 'm4a' },
  subtitle: null,
  ...over,
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

let dir
let cache
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'piano-manager-'))
  cache = new CacheStore({ dir, limitBytes: 1_000_000 })
  await cache.load()
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function make(over = {}) {
  const tools = {
    available: true,
    ensure: vi.fn(async () => ({ ytdlp: '/bin/yt', ffmpeg: '/bin/ff' })),
    paths: () => ({ ytdlp: '/bin/yt', ffmpeg: '/bin/ff' }),
    renewAfterExtractorError: vi.fn(async () => false),
    ...over.tools,
  }
  const fetchRange = over.fetchRange ?? (async (url, start, end) => CDN[url].subarray(start, end))
  const mux = over.mux ?? vi.fn(async ({ video, audio, output }) => {
    const data = Buffer.concat([readFileSync(video), audio ? readFileSync(audio) : Buffer.alloc(0)])
    writeFileSync(output, data)
    return data.length
  })
  const onChange = vi.fn()
  const created = []
  const manager = new OnlineVideoManager({
    tools,
    cache,
    getSettings: () => ({ maxHeight: 1080, locale: 'pt-BR' }),
    ytdlpCacheDir: '/yt-cache',
    jsRuntime: 'node:/electron',
    resolve: over.resolve ?? vi.fn(async ({ id }) => info(id)),
    createTrack: (opts) => {
      const track = new Track({ ...opts, fetchRange, chunkSize: 1000, retryDelayMs: 0 })
      created.push({ opts, track })
      return track
    },
    mux,
    exec: over.exec ?? vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
    downloadSubtitle: over.downloadSubtitle ?? vi.fn(async (url, file) => writeFileSync(file, 'WEBVTT')),
    now: over.now,
    onChange,
  })
  return { manager, tools, mux, onChange, created }
}

const bodyOf = async (response) => Buffer.from(await response.arrayBuffer())
const waitState = (manager, id, state) => vi.waitFor(() => expect(manager.status(id).state).toBe(state))

describe('OnlineVideoManager.play', () => {
  it('sem cache: devolve as trilhas baixando e, no fim, monta no cache', async () => {
    const { manager, mux, onChange } = make()
    expect(manager.available).toBe(true)
    const source = await manager.play(A)
    expect(source).toEqual({
      kind: 'stream',
      id: A,
      title: `Hino ${A}`,
      duration: 60,
      src: `${STREAM_URL_BASE}/${A}/video`,
      audioSrc: `${STREAM_URL_BASE}/${A}/audio`,
      subtitle: null,
    })
    expect(await bodyOf(manager.serve(A, 'video', 'bytes=0-'))).toEqual(CDN['https://v.googlevideo.com/v'])

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(A, { state: 'ready' }))
    expect(mux).toHaveBeenCalledWith(expect.objectContaining({ ffmpeg: '/bin/ff', output: cache.videoPath(A) }))
    expect(cache.get(A)).toMatchObject({ title: `Hino ${A}`, size: 8000, height: 720 })
    const states = onChange.mock.calls.filter(([id]) => id === A).map(([, s]) => s.state)
    expect(states).toEqual(expect.arrayContaining(['queued', 'resolving', 'downloading', 'muxing', 'ready']))

    expect(manager.serve(A, 'audio', null).status).toBe(200)
    expect(cache.protected.has(A)).toBe(true)
    await manager.release(A)
    expect(cache.protected.has(A)).toBe(false)
    expect(manager.serve(A, 'video', null).status).toBe(404)
    expect(existsSync(cache.streamDir(A))).toBe(false)
  })

  it('roda o yt-dlp com o Electron como Node, ambiente mínimo e a pasta do cache', async () => {
    const resolve = vi.fn(async (opts) => {
      await opts.run(['-J'])
      return info(opts.id)
    })
    const { manager } = make({ resolve })
    await manager.play(A)
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
      id: A, maxHeight: 1080, locale: 'pt-BR', jsRuntime: 'node:/electron', cacheDir: '/yt-cache',
    }))
    expect(manager.exec).toHaveBeenCalledWith('/bin/yt', ['-J'], expect.objectContaining({
      cwd: dir,
      env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1', PATH: expect.any(String) }),
    }))
  })

  it('no cache: devolve o arquivo sem baixar e renova o último uso', async () => {
    writeFileSync(cache.videoPath(A), 'mp4')
    writeFileSync(cache.subtitlePath(A), 'WEBVTT')
    await cache.add(A, { title: 'Pronto', duration: 30, size: 3, subtitleLang: 'pt' })
    const { manager } = make()
    const source = await manager.play(A)
    expect(source).toEqual({
      kind: 'cache', id: A, title: 'Pronto', duration: 30, file: cache.videoPath(A),
      src: `${CACHE_URL_BASE}/${A}.mp4`, subtitle: `${CACHE_URL_BASE}/${A}.vtt`,
    })
    expect(manager.resolve).not.toHaveBeenCalled()
    expect(manager.status(A)).toEqual({ state: 'ready' })
  })

  it('o mesmo vídeo pedido duas vezes usa uma só sessão', async () => {
    const { manager } = make()
    const [a, b] = await Promise.all([manager.play(A), manager.play(A)])
    expect(a).toEqual(b)
    expect(manager.resolve).toHaveBeenCalledTimes(1)
  })

  it('formato único: sem trilha de som separada', async () => {
    const { manager, mux } = make({ resolve: vi.fn(async ({ id }) => info(id, { audio: null })) })
    const source = await manager.play(A)
    expect(source.audioSrc).toBeNull()
    expect(manager.serve(A, 'audio', null).status).toBe(404)
    await waitState(manager, A, 'ready')
    expect(mux).toHaveBeenCalledWith(expect.objectContaining({ audio: null }))
  })

  it('legenda do autor: baixa ao lado do vídeo e informa o endereço', async () => {
    const downloadSubtitle = vi.fn(async (url, file) => writeFileSync(file, 'WEBVTT'))
    const { manager } = make({
      downloadSubtitle,
      resolve: vi.fn(async ({ id }) => info(id, { subtitle: { lang: 'pt', url: 'https://www.youtube.com/s' } })),
    })
    const source = await manager.play(A)
    expect(source.subtitle).toBe(`${CACHE_URL_BASE}/${A}.vtt`)
    expect(downloadSubtitle).toHaveBeenCalledWith('https://www.youtube.com/s', cache.subtitlePath(A), expect.any(AbortSignal))
    await waitState(manager, A, 'ready')
    expect(cache.get(A).subtitleLang).toBe('pt')
  })

  it('legenda que falha não impede o vídeo', async () => {
    const { manager } = make({
      downloadSubtitle: vi.fn(async () => { throw new Error('HTTP 404') }),
      resolve: vi.fn(async ({ id }) => info(id, { subtitle: { lang: 'pt', url: 'https://www.youtube.com/s' } })),
    })
    expect((await manager.play(A)).subtitle).toBeNull()
  })

  it('espera o available_at antes do primeiro pedido à CDN', async () => {
    let clock = 1000
    const fetchRange = vi.fn(async (url, start, end) => CDN[url].subarray(start, end))
    const { manager } = make({ fetchRange, now: () => clock, resolve: vi.fn(async ({ id }) => info(id, { availableAt: 1040 })) })
    const started = Date.now()
    await manager.play(A)
    expect(Date.now() - started).toBeGreaterThanOrEqual(30)
    expect(clock).toBe(1000)
  })

  it('falha antes de tocar: rejeita com o motivo e registra o erro', async () => {
    const { manager } = make({ resolve: vi.fn(async () => { throw new OnlineVideoError('unavailable', 'Private video') }) })
    await expect(manager.play(A)).rejects.toMatchObject({ code: 'unavailable' })
    expect(manager.status(A)).toEqual({ state: 'error', code: 'unavailable', message: 'Private video' })
    expect(cache.protected.has(A)).toBe(false)
    expect(manager.sessions.has(A)).toBe(false)
  })

  it('ferramentas indisponíveis e erros genéricos viram falha', async () => {
    const { manager } = make({ tools: { ensure: vi.fn(async () => { throw new Error('sem rede') }) } })
    await expect(manager.play(A)).rejects.toMatchObject({ code: 'network', message: 'sem rede' })
  })

  it('erro de extração: renova o yt-dlp e tenta de novo uma vez', async () => {
    const resolve = vi.fn()
      .mockRejectedValueOnce(new OnlineVideoError('extractor', 'nsig'))
      .mockImplementation(async ({ id }) => info(id))
    const { manager, tools } = make({ resolve, tools: { renewAfterExtractorError: vi.fn(async () => true) } })
    await manager.play(A)
    expect(tools.renewAfterExtractorError).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('erro de extração sem versão nova do yt-dlp: falha', async () => {
    const resolve = vi.fn(async () => { throw new OnlineVideoError('extractor', 'nsig') })
    const { manager } = make({ resolve })
    await expect(manager.play(A)).rejects.toMatchObject({ code: 'extractor' })
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('ID inválido é recusado', async () => {
    const { manager } = make()
    await expect(manager.play('../etc')).rejects.toMatchObject({ code: 'format' })
  })

  it('montagem que falha enquanto toca: mantém as trilhas até sair da tela', async () => {
    const mux = vi.fn(async () => { throw new OnlineVideoError('tools', 'ffmpeg falhou') })
    const { manager } = make({ mux })
    await manager.play(A)
    await waitState(manager, A, 'error')
    expect(manager.serve(A, 'video', null).status).toBe(200)
    expect(cache.has(A)).toBe(false)
    expect(manager.status(A)).toMatchObject({ state: 'error', code: 'tools' })

    await manager.release(A)
    expect(manager.serve(A, 'video', null).status).toBe(404)
  })

  it('tocar de novo depois de uma montagem com falha começa outra sessão', async () => {
    const mux = vi.fn()
      .mockRejectedValueOnce(new OnlineVideoError('tools', 'ffmpeg falhou'))
      .mockImplementation(async ({ output }) => { writeFileSync(output, 'x'); return 1 })
    const { manager } = make({ mux })
    await manager.play(A)
    await waitState(manager, A, 'error')
    const source = await manager.play(A)
    expect(source.kind).toBe('stream')
    await waitState(manager, A, 'ready')
    expect(manager.resolve).toHaveBeenCalledTimes(2)
  })

  it('montagem que falha sem estar tocando: limpa tudo', async () => {
    const mux = vi.fn(async () => { throw new OnlineVideoError('disk', 'cheio') })
    const { manager } = make({ mux })
    manager.prefetch([A])
    await waitState(manager, A, 'error')
    expect(manager.sessions.has(A)).toBe(false)
    expect(existsSync(cache.streamDir(A))).toBe(false)
  })
})

describe('OnlineVideoManager em segundo plano', () => {
  it('antecipa um por vez e promove ao primeiro plano quando o vídeo é pedido', async () => {
    const gates = { [A]: deferred(), [B]: deferred() }
    const resolve = vi.fn(async ({ id }) => {
      await gates[id].promise
      return info(id)
    })
    const { manager } = make({ resolve })
    manager.prefetch([A, B])
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(1))
    expect(manager.status(A).state).toBe('resolving')
    expect(manager.status(B)).toEqual({ state: 'queued', progress: 0 })

    const playing = manager.play(B)
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(2))
    gates[B].resolve()
    expect((await playing).kind).toBe('stream')
    gates[A].resolve()
    await waitState(manager, A, 'ready')
    await waitState(manager, B, 'ready')
  })

  it('promover o antecipado em andamento libera a fila para o próximo', async () => {
    const gates = { [A]: deferred(), [B]: deferred() }
    const resolve = vi.fn(async ({ id }) => {
      await gates[id].promise
      return info(id)
    })
    const { manager } = make({ resolve })
    manager.prefetch([A, B])
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(1))
    const playing = manager.play(A)
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(2))
    expect(resolve.mock.calls[1][0].id).toBe(B)
    gates[A].resolve()
    gates[B].resolve()
    await playing
    await waitState(manager, B, 'ready')
  })

  it('não enfileira ID inválido, vídeo no cache nem o que já está baixando; erro antigo sai ao tentar de novo', async () => {
    writeFileSync(cache.videoPath(B), 'x')
    await cache.add(B, { size: 1 })
    const resolve = vi.fn()
      .mockRejectedValueOnce(new OnlineVideoError('network', 'timed out'))
      .mockImplementation(async ({ id }) => info(id))
    const { manager } = make({ resolve })
    manager.prefetch([A, A, B, 'x'])
    await waitState(manager, A, 'error')
    expect(resolve).toHaveBeenCalledTimes(1)
    manager.prefetch([A])
    expect(manager.status(A).state).not.toBe('error')
    await waitState(manager, A, 'ready')
  })

  it('cancelar: na fila sai na hora; baixando encerra e apaga os temporários', async () => {
    const gate = deferred()
    const fetchRange = vi.fn(async (url, start, end) => {
      await gate.promise
      return CDN[url].subarray(start, end)
    })
    const downloadSubtitle = vi.fn(async (url, file) => writeFileSync(file, 'WEBVTT'))
    const { manager } = make({
      fetchRange,
      downloadSubtitle,
      resolve: vi.fn(async ({ id }) => info(id, { subtitle: { lang: 'pt', url: 'https://www.youtube.com/s' } })),
    })
    manager.prefetch([A, B])
    await waitState(manager, A, 'downloading')
    await manager.cancel(B)
    expect(manager.status(B).state).toBe('none')

    await manager.cancel(A)
    expect(manager.status(A)).toEqual({ state: 'none' })
    expect(existsSync(cache.streamDir(A))).toBe(false)
    expect(existsSync(cache.subtitlePath(A))).toBe(false)
    expect(manager.failures.size).toBe(0)
    await manager.cancel(A)
    gate.resolve()
  })

  it('cancelar não interrompe o vídeo que está tocando; cancelAll para tudo', async () => {
    const gate = deferred()
    const fetchRange = vi.fn(async (url, start, end) => {
      await gate.promise
      return CDN[url].subarray(start, end)
    })
    const { manager } = make({ fetchRange })
    await manager.play(A)
    await manager.cancel(A)
    expect(manager.status(A).state).toBe('downloading')

    manager.prefetch([B])
    await manager.cancelAll({ keepPlaying: true })
    expect([...manager.sessions.keys()]).toEqual([A])
    await manager.cancelAll()
    expect(manager.sessions.size).toBe(0)
    gate.resolve()
  })

  it('cancelar enquanto espera o available_at', async () => {
    const { manager } = make({ now: () => 0, resolve: vi.fn(async ({ id }) => info(id, { availableAt: 60_000 })) })
    manager.prefetch([A])
    await vi.waitFor(() => expect(manager.resolve).toHaveBeenCalled())
    await manager.cancel(A)
    expect(manager.status(A).state).toBe('none')
  })

  it('progresso soma as duas trilhas', async () => {
    const { manager, onChange } = make()
    manager.prefetch([A])
    await waitState(manager, A, 'ready')
    const progress = onChange.mock.calls.map(([, s]) => s.progress).filter((p) => typeof p === 'number')
    expect(progress.at(-1)).toBe(1)
    expect(progress.some((p) => p > 0 && p < 1)).toBe(true)
  })
})

describe('OnlineVideoManager.serve e renovação de link', () => {
  it('trilha webm usa o tipo certo', async () => {
    const resolve = vi.fn(async ({ id }) => info(id, {
      video: { url: 'https://v.googlevideo.com/v', size: 5000, ext: 'webm' },
      audio: { url: 'https://v.googlevideo.com/a', size: 3000, ext: 'webm' },
    }))
    const { manager } = make({ resolve })
    await manager.play(A)
    expect(manager.serve(A, 'video', null).headers.get('Content-Type')).toBe('video/webm')
    expect(manager.serve(A, 'audio', null).headers.get('Content-Type')).toBe('audio/webm')
  })

  it('link expirado: redescobre a trilha; tamanho diferente é recusado', async () => {
    const resolve = vi.fn(async ({ id }) => info(id))
    const { manager, created } = make({ resolve })
    await manager.play(A)
    const video = created.find((c) => c.opts.file.endsWith('video'))
    expect(await video.opts.refreshUrl()).toBe('https://v.googlevideo.com/v')
    resolve.mockImplementation(async ({ id }) => info(id, { video: { url: 'https://v.googlevideo.com/v2', size: 1, ext: 'mp4' } }))
    await expect(video.opts.refreshUrl()).rejects.toMatchObject({ code: 'format' })
  })
})
