// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MUX_TEMP_PREFIX, buildMuxArgs, mux } from '../mux.mjs'

let dir
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'piano-mux-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('buildMuxArgs', () => {
  it('duas trilhas: imagem da primeira, som da segunda, sem recodificar e com faststart', () => {
    const args = buildMuxArgs({ video: 'v.mp4', audio: 'a.m4a', output: 'o.mp4' })
    expect(args).toEqual([
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
      '-i', 'v.mp4', '-i', 'a.m4a',
      '-map', '0:v:0', '-map', '1:a:0',
      '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', 'o.mp4',
    ])
  })

  it('formato único: imagem e som (se houver) do mesmo arquivo', () => {
    const args = buildMuxArgs({ video: 'v.mp4', audio: null, output: 'o.mp4' })
    expect(args.filter(a => a === '-i')).toHaveLength(1)
    expect(args).toContain('0:a:0?')
  })
})

describe('mux', () => {
  const ffmpegWrites = (content) => vi.fn(async (file, args) => {
    writeFileSync(args.at(-1), content)
    return { code: 0, stdout: '', stderr: '' }
  })

  it('monta num temporário e só então renomeia para o arquivo final', async () => {
    const output = path.join(dir, 'abcdefghijk.mp4')
    const exec = ffmpegWrites('mp4-final')
    const size = await mux({ ffmpeg: '/bin/ffmpeg', video: 'v', audio: 'a', output, exec })

    const [file, args, opts] = exec.mock.calls[0]
    expect(file).toBe('/bin/ffmpeg')
    expect(path.basename(args.at(-1))).toBe(`${MUX_TEMP_PREFIX}abcdefghijk.mp4`)
    expect(opts).toMatchObject({ cwd: dir, env: expect.objectContaining({ PATH: expect.any(String) }) })
    expect(readFileSync(output, 'utf8')).toBe('mp4-final')
    expect(size).toBe(9)
    expect(readdirSync(dir)).toEqual(['abcdefghijk.mp4'])
  })

  it('falha do ffmpeg: apaga o temporário e não cria o final', async () => {
    const output = path.join(dir, 'x.mp4')
    const exec = vi.fn(async (file, args) => {
      writeFileSync(args.at(-1), 'meio')
      return { code: 1, stdout: '', stderr: 'aviso\nInvalid data found\n' }
    })
    await expect(mux({ ffmpeg: 'f', video: 'v', audio: 'a', output, exec }))
      .rejects.toMatchObject({ code: 'tools', message: 'ffmpeg falhou: Invalid data found' })
    expect(readdirSync(dir)).toEqual([])
  })

  it('disco cheio vira erro de disco; sem stderr mostra o código', async () => {
    const output = path.join(dir, 'x.mp4')
    await expect(mux({ ffmpeg: 'f', video: 'v', output, exec: async () => ({ code: 1, stdout: '', stderr: 'No space left on device' }) }))
      .rejects.toMatchObject({ code: 'disk' })
    await expect(mux({ ffmpeg: 'f', video: 'v', output, exec: async () => ({ code: 7, stdout: '', stderr: '' }) }))
      .rejects.toMatchObject({ message: 'ffmpeg falhou: código 7' })
  })

  it('cancelado: apaga o temporário e informa cancelled', async () => {
    const output = path.join(dir, 'x.mp4')
    const ac = new AbortController()
    const exec = vi.fn(async (file, args) => {
      writeFileSync(args.at(-1), 'meio')
      ac.abort()
      return { code: 0, stdout: '', stderr: '' }
    })
    await expect(mux({ ffmpeg: 'f', video: 'v', output, exec, signal: ac.signal })).rejects.toMatchObject({ code: 'cancelled' })
    expect(existsSync(output)).toBe(false)
    expect(readdirSync(dir)).toEqual([])
  })
})
