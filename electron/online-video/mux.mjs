/**
 * Junta imagem e som baixados num `.mp4` sem recodificar. O resultado nasce num temporário
 * e só vira o arquivo final depois que o ffmpeg termina, para o cache nunca ter vídeo pela metade.
 */
import { rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { OnlineVideoError } from './resolver.mjs'
import { execTool, minimalEnv } from './tools.mjs'

export const MUX_TEMP_PREFIX = '.mux-'
const MUX_TIMEOUT_MS = 10 * 60 * 1000

/**
 * @param {{ video: string, audio?: string | null, output: string }} opts
 * Sem `audio`, a trilha de imagem já traz o som (formato único).
 */
export function buildMuxArgs({ video, audio, output }) {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    video,
    ...(audio ? ['-i', audio] : []),
    '-map',
    '0:v:0',
    '-map',
    audio ? '1:a:0' : '0:a:0?',
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output,
  ]
}

/**
 * @param {{ ffmpeg: string, video: string, audio?: string | null, output: string,
 *   exec?: typeof execTool, signal?: AbortSignal }} opts
 * @returns {Promise<number>} tamanho do arquivo final
 */
export async function mux({ ffmpeg, video, audio, output, exec = execTool, signal }) {
  const temp = path.join(path.dirname(output), `${MUX_TEMP_PREFIX}${path.basename(output)}`)
  const result = await exec(ffmpeg, buildMuxArgs({ video, audio, output: temp }), {
    timeoutMs: MUX_TIMEOUT_MS,
    env: minimalEnv(),
    cwd: path.dirname(output),
    signal,
  })
  if (result.code !== 0 || signal?.aborted) {
    await rm(temp, { force: true })
    if (signal?.aborted) throw new OnlineVideoError('cancelled', 'Montagem cancelada')
    const code = /No space left on device/i.test(result.stderr) ? 'disk' : 'tools'
    const detail = result.stderr.trim().split('\n').at(-1) || `código ${result.code}`
    throw new OnlineVideoError(code, `ffmpeg falhou: ${detail}`)
  }
  await rename(temp, output)
  return (await stat(output)).size
}
