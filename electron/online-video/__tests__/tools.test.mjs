// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RENEW_INTERVAL_MS,
  Tools,
  UPDATE_INTERVAL_MS,
  downloadVerified,
  execTool,
  extractZip,
  minimalEnv,
  parseSha256Sums,
  platformAssets,
} from '../tools.mjs'

const require = createRequire(import.meta.url)
const yazl = require('yazl')

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

/** @param {Array<{ name: string, data?: string, mode?: number }>} entries */
function makeZip(entries) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile()
    for (const { name, data = '', mode } of entries) {
      if (name.endsWith('/')) zip.addEmptyDirectory(name)
      else zip.addBuffer(Buffer.from(data), name, mode ? { mode } : {})
    }
    zip.end()
    const chunks = []
    zip.outputStream.on('data', (c) => chunks.push(c))
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.on('error', reject)
  })
}

/** GitHub em memória: URL → corpo. */
function fakeGithub(files) {
  const fetchImpl = vi.fn(async (url) => {
    const body = files[url]
    if (body === undefined) return new Response('not found', { status: 404 })
    return new Response(body, { status: 200, headers: { 'content-length': String(Buffer.byteLength(body)) } })
  })
  return fetchImpl
}

const YT = 'https://yt.test'
const FF = 'https://ff.test'

let dir
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'piano-tools-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('platformAssets', () => {
  it('mapeia as plataformas com binário publicado', () => {
    expect(platformAssets('linux', 'x64')).toMatchObject({ ytdlp: 'yt-dlp_linux.zip', ffmpeg: { asset: 'ffmpeg-linux-x64.gz' }, exeSuffix: '' })
    expect(platformAssets('linux', 'arm64')).toMatchObject({ ytdlp: 'yt-dlp_linux_aarch64.zip', ffmpeg: { asset: 'ffmpeg-linux-arm64.gz' } })
    expect(platformAssets('darwin', 'arm64')).toMatchObject({ ytdlp: 'yt-dlp_macos.zip', ffmpeg: { asset: 'ffmpeg-darwin-arm64.gz' } })
    expect(platformAssets('darwin', 'x64')).toMatchObject({ ytdlp: 'yt-dlp_macos.zip', ffmpeg: { asset: 'ffmpeg-darwin-x64.gz' } })
    expect(platformAssets('win32', 'x64')).toMatchObject({ ytdlp: 'yt-dlp_win.zip', ffmpeg: { asset: 'ffmpeg-win32-x64.gz' }, exeSuffix: '.exe' })
  })

  it('Windows em ARM usa o ffmpeg x64 emulado', () => {
    expect(platformAssets('win32', 'arm64')).toMatchObject({ ytdlp: 'yt-dlp_win_arm64.zip', ffmpeg: { asset: 'ffmpeg-win32-x64.gz' } })
  })

  it('sem binário publicado: null', () => {
    expect(platformAssets('linux', 'ia32')).toBeNull()
    expect(platformAssets('freebsd', 'x64')).toBeNull()
  })

  it('todo ffmpeg tem SHA-256 fixado', () => {
    for (const [p, a] of [['linux', 'x64'], ['linux', 'arm64'], ['darwin', 'x64'], ['darwin', 'arm64'], ['win32', 'x64']]) {
      expect(platformAssets(p, a).ffmpeg.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})

describe('parseSha256Sums', () => {
  it('lê as linhas válidas e ignora o resto', () => {
    const a = 'a'.repeat(64)
    const b = 'B'.repeat(64)
    const sums = parseSha256Sums(`${a}  yt-dlp_linux.zip\n${b} *yt-dlp_win.zip\nlixo\n\n`)
    expect(sums.get('yt-dlp_linux.zip')).toBe(a)
    expect(sums.get('yt-dlp_win.zip')).toBe('b'.repeat(64))
    expect(sums.size).toBe(2)
    expect(parseSha256Sums(undefined).size).toBe(0)
  })
})

describe('minimalEnv', () => {
  it('Linux: PATH mínimo e sem variáveis do app', () => {
    const env = minimalEnv({ ELECTRON_RUN_AS_NODE: '1' }, { HOME: '/h', SECRET: 'x', PATH: '/opt/bin' }, 'linux')
    expect(env).toEqual({ HOME: '/h', PATH: '/usr/bin:/bin', ELECTRON_RUN_AS_NODE: '1' })
  })

  it('Windows: PATH com a pasta do sistema', () => {
    expect(minimalEnv({}, { SystemRoot: 'C:\\Windows', TEMP: 'C:\\t' }, 'win32'))
      .toEqual({ SystemRoot: 'C:\\Windows', TEMP: 'C:\\t', PATH: 'C:\\Windows\\System32;C:\\Windows' })
    expect(minimalEnv({}, {}, 'win32').PATH).toBe('')
  })
})

describe('execTool', () => {
  it('sucesso e falha sem rejeitar', async () => {
    const ok = await execTool(process.execPath, ['-e', 'process.stdout.write("v1")'], { env: { ELECTRON_RUN_AS_NODE: '1' } })
    expect(ok).toEqual({ code: 0, stdout: 'v1', stderr: '' })
    const bad = await execTool(process.execPath, ['-e', 'process.stderr.write("boom");process.exit(3)'], { env: { ELECTRON_RUN_AS_NODE: '1' } })
    expect(bad.code).toBe(3)
    expect(bad.stderr).toBe('boom')
    const missing = await execTool(path.join(dir, 'nao-existe'), [])
    expect(missing.code).toBe(1)
    expect(missing.stderr).toMatch(/ENOENT/)
  })
})

describe('downloadVerified', () => {
  const body = Buffer.from('conteudo do binario')

  it('grava o arquivo quando o hash confere e informa o progresso', async () => {
    const file = path.join(dir, 'bin')
    const onProgress = vi.fn()
    await downloadVerified({ url: 'u', file, sha256: sha(body).toUpperCase(), fetchImpl: fakeGithub({ u: body }), onProgress })
    expect(readFileSync(file)).toEqual(body)
    expect(onProgress).toHaveBeenLastCalledWith(body.length, body.length)
    expect(existsSync(`${file}.part`)).toBe(false)
  })

  it('hash diferente: recusa e não deixa arquivo', async () => {
    const file = path.join(dir, 'bin')
    await expect(downloadVerified({ url: 'u', file, sha256: 'f'.repeat(64), fetchImpl: fakeGithub({ u: body }) }))
      .rejects.toMatchObject({ code: 'tools', message: expect.stringMatching(/SHA-256/) })
    expect(readdirSync(dir)).toEqual([])
  })

  it('HTTP de erro vira falha das ferramentas', async () => {
    await expect(downloadVerified({ url: 'x', file: path.join(dir, 'bin'), sha256: sha(body), fetchImpl: fakeGithub({}) }))
      .rejects.toMatchObject({ code: 'tools', message: expect.stringMatching(/HTTP 404/) })
  })

  it('erro de rede vira falha das ferramentas; cancelamento vira cancelled', async () => {
    const offline = vi.fn(async () => { throw new TypeError('fetch failed') })
    await expect(downloadVerified({ url: 'u', file: path.join(dir, 'bin'), sha256: sha(body), fetchImpl: offline }))
      .rejects.toMatchObject({ code: 'tools', message: 'fetch failed' })
    const ac = new AbortController()
    ac.abort()
    const aborting = vi.fn(async () => { throw new DOMException('aborted', 'AbortError') })
    await expect(downloadVerified({ url: 'u', file: path.join(dir, 'bin'), sha256: sha(body), fetchImpl: aborting, signal: ac.signal }))
      .rejects.toMatchObject({ code: 'cancelled' })
  })
})

describe('extractZip', () => {
  it('extrai pastas, permissões e links internos', async () => {
    const zipFile = path.join(dir, 'a.zip')
    writeFileSync(zipFile, await makeZip([
      { name: 'yt-dlp_linux', data: 'bin', mode: 0o100755 },
      { name: '_internal/' },
      { name: '_internal/lib/x.so', data: 'so' },
      { name: '_internal/link.so', data: 'lib/x.so', mode: 0o120777 },
    ]))
    const out = path.join(dir, 'out')
    await extractZip(zipFile, out)
    expect(readFileSync(path.join(out, 'yt-dlp_linux'), 'utf8')).toBe('bin')
    expect(statSync(path.join(out, 'yt-dlp_linux')).mode & 0o777).toBe(0o755)
    expect(readFileSync(path.join(out, '_internal/lib/x.so'), 'utf8')).toBe('so')
    expect(readlinkSync(path.join(out, '_internal/link.so'))).toBe('lib/x.so')
    expect(readFileSync(path.join(out, '_internal/link.so'), 'utf8')).toBe('so')
  })

  it('recusa link que aponta para fora da pasta', async () => {
    const zipFile = path.join(dir, 'a.zip')
    writeFileSync(zipFile, await makeZip([{ name: 'evil', data: '../../etc/passwd', mode: 0o120777 }]))
    await expect(extractZip(zipFile, path.join(dir, 'out'))).rejects.toMatchObject({ code: 'tools', message: expect.stringMatching(/Link inválido/) })
  })

  it('arquivo que não é zip vira falha das ferramentas', async () => {
    const zipFile = path.join(dir, 'a.zip')
    writeFileSync(zipFile, 'nao sou zip')
    await expect(extractZip(zipFile, path.join(dir, 'out'))).rejects.toMatchObject({ code: 'tools' })
  })
})

describe('Tools', () => {
  const ffmpegBin = Buffer.from('ffmpeg-binario')
  const ffmpegGz = gzipSync(ffmpegBin)
  let ytZip
  let ytZip2
  let binDir
  let clock

  beforeEach(async () => {
    ytZip = await makeZip([{ name: 'yt-dlp_linux', data: 'v1', mode: 0o100755 }, { name: '_internal/base_library.zip', data: 'z' }])
    ytZip2 = await makeZip([{ name: 'yt-dlp_linux', data: 'v2', mode: 0o100755 }])
    binDir = path.join(dir, 'bin')
    clock = 1_000_000
  })

  const assets = () => ({ ytdlp: 'yt-dlp_linux.zip', ffmpeg: { asset: 'ffmpeg-linux-x64.gz', sha256: sha(ffmpegGz) }, exeSuffix: '' })
  const sums = (zip) => `${sha(zip)}  yt-dlp_linux.zip\n${'0'.repeat(64)}  yt-dlp_win.zip\n`
  const github = (zip = ytZip) => ({
    [`${YT}/SHA2-256SUMS`]: sums(zip),
    [`${YT}/yt-dlp_linux.zip`]: zip,
    [`${FF}/ffmpeg-linux-x64.gz`]: ffmpegGz,
  })
  const okExec = () => vi.fn(async (file, args) => ({
    code: 0,
    stdout: args[0] === '--version' ? `${readFileSync(file, 'utf8')}.2026\n` : 'ffmpeg version 6.0-static\nmore',
    stderr: '',
  }))
  const make = (overrides = {}) => new Tools({
    binDir,
    assets: assets(),
    fetchImpl: fakeGithub(github()),
    exec: okExec(),
    now: () => clock,
    ytdlpBaseUrl: YT,
    ffmpegBaseUrl: FF,
    ...overrides,
  })

  it('instala as duas ferramentas, confere a execução e grava o registro', async () => {
    const onStatus = vi.fn()
    const tools = make({ onStatus })
    expect(tools.status()).toEqual({ state: 'missing' })
    const paths = await tools.ensure()

    expect(paths.ytdlp).toBe(path.join(binDir, 'ytdlp', sha(ytZip).slice(0, 16), 'yt-dlp_linux'))
    expect(paths.ffmpeg).toBe(path.join(binDir, 'ffmpeg', sha(ffmpegGz).slice(0, 16), 'ffmpeg'))
    expect(readFileSync(paths.ffmpeg)).toEqual(ffmpegBin)
    expect(statSync(paths.ffmpeg).mode & 0o777).toBe(0o755)
    expect(statSync(paths.ytdlp).mode & 0o777).toBe(0o755)
    expect(existsSync(path.join(path.dirname(paths.ytdlp), '_internal/base_library.zip'))).toBe(true)
    expect(tools.exec).toHaveBeenCalledWith(paths.ytdlp, ['--version'], expect.objectContaining({ env: expect.objectContaining({ PATH: expect.any(String) }) }))
    expect(tools.exec).toHaveBeenCalledWith(paths.ffmpeg, ['-version'], expect.any(Object))
    expect(tools.status()).toEqual({ state: 'ready', version: 'v1.2026' })

    const record = JSON.parse(readFileSync(path.join(binDir, 'tools.json'), 'utf8'))
    expect(record.ytdlp).toMatchObject({ sha256: sha(ytZip), version: 'v1.2026', checkedAt: clock, renewedAt: 0 })
    expect(record.ffmpeg).toMatchObject({ sha256: sha(ffmpegGz), version: 'ffmpeg version 6.0-static' })
    expect(readdirSync(path.join(binDir, 'ytdlp'))).toEqual([sha(ytZip).slice(0, 16)])
    expect(readdirSync(path.join(binDir, 'ffmpeg'))).toEqual([sha(ffmpegGz).slice(0, 16)])

    const states = onStatus.mock.calls.map(([s]) => s.state)
    expect(states[0]).toBe('installing')
    expect(states.at(-1)).toBe('ready')
    expect(onStatus).toHaveBeenCalledWith({ state: 'installing', tool: 'ffmpeg', progress: 1 })
    expect(onStatus).toHaveBeenCalledWith({ state: 'installing', tool: 'ytdlp', progress: 1 })
  })

  it('chamadas simultâneas usam a mesma instalação; pronto não baixa de novo', async () => {
    const tools = make()
    const [a, b] = await Promise.all([tools.ensure(), tools.ensure()])
    expect(a).toEqual(b)
    expect(tools.fetchImpl).toHaveBeenCalledTimes(3)
    await tools.ensure()
    expect(tools.fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('plataforma sem binário: indisponível', async () => {
    const tools = make({ assets: null })
    expect(tools.available).toBe(false)
    expect(tools.status()).toEqual({ state: 'unavailable' })
    await expect(tools.ensure()).rejects.toMatchObject({ code: 'tools' })
    expect(await tools.checkForUpdate()).toBe(false)
  })

  it('progresso sem content-length fica em 0', async () => {
    const onStatus = vi.fn()
    const files = github()
    const fetchImpl = vi.fn(async (url) => new Response(files[url]))
    await make({ fetchImpl, onStatus }).ensure()
    expect(onStatus).toHaveBeenCalledWith({ state: 'installing', tool: 'ffmpeg', progress: 0 })
  })

  it('release sem o asset da plataforma: erro e nova tentativa depois', async () => {
    const files = { ...github(), [`${YT}/SHA2-256SUMS`]: `${'1'.repeat(64)}  outro.zip\n` }
    const tools = make({ fetchImpl: fakeGithub(files) })
    await expect(tools.ensure()).rejects.toMatchObject({ code: 'tools', message: expect.stringMatching(/não publica yt-dlp_linux.zip/) })
    expect(tools.status()).toEqual({ state: 'error', error: expect.stringMatching(/não publica/) })
    expect(tools.paths().ffmpeg).not.toBeNull()

    tools.fetchImpl = fakeGithub(github())
    await tools.ensure()
    expect(tools.status().state).toBe('ready')
  })

  it('lista de hashes fora do ar: erro das ferramentas', async () => {
    const files = github()
    delete files[`${YT}/SHA2-256SUMS`]
    await expect(make({ fetchImpl: fakeGithub(files) }).ensure()).rejects.toMatchObject({ code: 'tools', message: expect.stringMatching(/HTTP 404/) })
  })

  it('yt-dlp que não executa: apaga a pasta e informa o motivo', async () => {
    const exec = vi.fn(async (file, args) => (args[0] === '--version'
      ? { code: 1, stdout: '', stderr: 'linha\nPermission denied\n' }
      : { code: 0, stdout: 'ffmpeg version 6', stderr: '' }))
    const tools = make({ exec })
    await expect(tools.ensure()).rejects.toMatchObject({ code: 'tools', message: 'O yt-dlp baixado não executa: Permission denied' })
    expect(readdirSync(path.join(binDir, 'ytdlp'))).toEqual([])
    expect(tools.paths().ytdlp).toBeNull()
  })

  it('ffmpeg que não executa: apaga a pasta; sem stderr mostra o código', async () => {
    const exec = vi.fn(async () => ({ code: 9, stdout: '', stderr: '' }))
    const tools = make({ exec })
    await expect(tools.ensure()).rejects.toMatchObject({ code: 'tools', message: 'O ffmpeg baixado não executa: código 9' })
    expect(readdirSync(path.join(binDir, 'ffmpeg'))).toEqual([])
  })

  it('cancelar durante a conferência da execução vira cancelled', async () => {
    const ac = new AbortController()
    const exec = vi.fn(async () => { ac.abort(); return { code: 0, stdout: 'x', stderr: '' } })
    await expect(make({ exec }).ensure({ signal: ac.signal })).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('ffmpeg com hash diferente do fixado: recusa', async () => {
    const tools = make({ assets: { ...assets(), ffmpeg: { asset: 'ffmpeg-linux-x64.gz', sha256: 'e'.repeat(64) } } })
    await expect(tools.ensure()).rejects.toMatchObject({ code: 'tools', message: expect.stringMatching(/SHA-256/) })
    expect(tools.paths().ffmpeg).toBeNull()
  })

  it('zip sem executável do yt-dlp: recusa', async () => {
    const empty = await makeZip([{ name: 'LEIAME.txt', data: 'x' }])
    await expect(make({ fetchImpl: fakeGithub(github(empty)) }).ensure())
      .rejects.toMatchObject({ code: 'tools', message: expect.stringMatching(/não encontrado/) })
  })

  it('Windows: encontra o .exe na raiz do zip', async () => {
    const winZip = await makeZip([{ name: 'yt-dlp.exe', data: 'w' }, { name: 'README.txt', data: 'r' }])
    const files = {
      [`${YT}/SHA2-256SUMS`]: `${sha(winZip)}  yt-dlp_win.zip\n`,
      [`${YT}/yt-dlp_win.zip`]: winZip,
      [`${FF}/ffmpeg-win32-x64.gz`]: ffmpegGz,
    }
    const tools = make({
      assets: { ytdlp: 'yt-dlp_win.zip', ffmpeg: { asset: 'ffmpeg-win32-x64.gz', sha256: sha(ffmpegGz) }, exeSuffix: '.exe' },
      fetchImpl: fakeGithub(files),
    })
    const paths = await tools.ensure()
    expect(path.basename(paths.ytdlp)).toBe('yt-dlp.exe')
    expect(path.basename(paths.ffmpeg)).toBe('ffmpeg.exe')
  })

  it('load(): retoma o registro salvo e descarta executável que sumiu', async () => {
    const first = make()
    const paths = await first.ensure()

    const second = make()
    expect(await second.load()).toEqual({ state: 'ready', version: 'v1.2026' })
    expect(second.paths()).toEqual(paths)

    rmSync(paths.ffmpeg)
    const third = make()
    expect(await third.load()).toEqual({ state: 'missing' })
    expect(third.paths()).toEqual({ ytdlp: paths.ytdlp, ffmpeg: null })
  })

  it('load(): registro ausente ou corrompido começa vazio', async () => {
    expect(await make().load()).toEqual({ state: 'missing' })
    mkdirSync(binDir, { recursive: true })
    writeFileSync(path.join(binDir, 'tools.json'), '{quebrado')
    expect(await make().load()).toEqual({ state: 'missing' })
    writeFileSync(path.join(binDir, 'tools.json'), 'null')
    expect(await make().load()).toEqual({ state: 'missing' })
  })

  it('atualização diária: pula dentro de 24 h, renova a data sem versão nova e troca quando há build novo', async () => {
    const tools = make()
    const v1 = (await tools.ensure()).ytdlp
    tools.fetchImpl.mockClear()

    clock += UPDATE_INTERVAL_MS - 1
    expect(await tools.checkForUpdate()).toBe(false)
    expect(tools.fetchImpl).not.toHaveBeenCalled()

    clock += 1
    expect(await tools.checkForUpdate()).toBe(false)
    expect(tools.fetchImpl).toHaveBeenCalledTimes(1)
    expect(tools.record.ytdlp.checkedAt).toBe(clock)

    tools.fetchImpl = fakeGithub(github(ytZip2))
    expect(await tools.checkForUpdate({ force: true })).toBe(true)
    const v2 = tools.paths().ytdlp
    expect(v2).not.toBe(v1)
    expect(tools.status()).toEqual({ state: 'ready', version: 'v2.2026' })
    expect(existsSync(v1)).toBe(true)

    await tools.cleanup()
    expect(existsSync(v1)).toBe(false)
    expect(existsSync(v2)).toBe(true)
    expect(existsSync(tools.paths().ffmpeg)).toBe(true)
  })

  it('checkForUpdate sem yt-dlp instala tudo; durante uma instalação só aguarda', async () => {
    const tools = make()
    expect(await tools.checkForUpdate()).toBe(true)
    expect(tools.status().state).toBe('ready')

    tools.fetchImpl = fakeGithub(github(ytZip2))
    const running = tools.checkForUpdate({ force: true })
    expect(await tools.checkForUpdate({ force: true })).toBe(false)
    expect(await running).toBe(true)
  })

  it('ensure durante uma atualização espera e devolve os caminhos novos', async () => {
    const tools = make()
    await tools.ensure()
    tools.fetchImpl = fakeGithub(github(ytZip2))
    tools.record.ffmpeg = undefined
    const running = tools.checkForUpdate({ force: true })
    const paths = await tools.ensure()
    await running
    expect(paths).toEqual(tools.paths())
  })

  it('renovação por erro de extração: na hora, no máximo uma vez por hora', async () => {
    const tools = make()
    expect(await tools.renewAfterExtractorError()).toBe(false)
    await tools.ensure()
    tools.fetchImpl = fakeGithub(github(ytZip2))

    clock += RENEW_INTERVAL_MS
    expect(await tools.renewAfterExtractorError()).toBe(true)
    expect(tools.status().version).toBe('v2.2026')
    expect(tools.record.ytdlp.renewedAt).toBe(clock)

    tools.fetchImpl.mockClear()
    clock += RENEW_INTERVAL_MS - 1
    expect(await tools.renewAfterExtractorError()).toBe(false)
    expect(tools.fetchImpl).not.toHaveBeenCalled()

    clock += 1
    expect(await tools.renewAfterExtractorError()).toBe(false)
    expect(tools.fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('cleanup sem pastas não falha e apaga restos de instalação', async () => {
    const tools = make()
    await tools.cleanup()
    await tools.ensure()
    const leftover = path.join(binDir, 'ytdlp', 'abc.tmp')
    mkdirSync(leftover)
    writeFileSync(path.join(binDir, 'ffmpeg', 'x.gz.part'), 'x')
    await tools.cleanup()
    expect(readdirSync(path.join(binDir, 'ytdlp'))).toEqual([tools.record.ytdlp.dir])
    expect(readdirSync(path.join(binDir, 'ffmpeg'))).toEqual([tools.record.ffmpeg.dir])
  })
})
