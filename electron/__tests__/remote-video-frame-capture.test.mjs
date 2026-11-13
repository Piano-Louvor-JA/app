// @vitest-environment node
/** Quadro do vídeo para o celular: pequeno e leve, só com vídeo/YouTube aberto. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const main = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
const START = 'export async function captureRemoteVideoFrame('
const END = '/** Miniatura do slide atual para o controle remoto (celular): JPEG pequeno. */'

function load({ mode = 'video', destroyed = false, size = { width: 1920, height: 1080 }, frames = [], loading = false, text = false } = {}) {
  const small = { toJPEG: vi.fn(() => Buffer.from('jpeg')) }
  const image = { isEmpty: () => false, getSize: () => size, resize: vi.fn(() => small), toJPEG: vi.fn(() => Buffer.from('full')) }
  const context = {
    Buffer,
    setTimeout,
    clearTimeout,
    Date,
    currentProjectionMode: mode,
    currentDocumentIsText: text,
    sourceWindow: {
      isDestroyed: () => destroyed,
      webContents: {
        capturePage: vi.fn(async () => image),
        isLoading: () => loading,
        mainFrame: { framesInSubtree: frames },
      },
    },
  }
  runInNewContext(main.slice(main.indexOf(START), main.indexOf(END)).replaceAll('export ', ''), context)
  return { context, image, small }
}

it('captura a janela do vídeo em 240 px, JPEG leve', async () => {
  const { context, image, small } = load()

  expect(await context.captureRemoteVideoFrame()).toBe(Buffer.from('jpeg').toString('base64'))
  expect(image.resize).toHaveBeenCalledWith({ width: 240, quality: 'low' })
  expect(small.toJPEG).toHaveBeenCalledWith(45)
})

it('fora do vídeo ou sem janela não captura', async () => {
  expect(await load({ mode: 'pdf' }).context.captureRemoteVideoFrame()).toBeNull()
  expect(await load({ mode: 'site' }).context.captureRemoteVideoFrame()).toBeNull()
  expect(await load({ destroyed: true }).context.captureRemoteVideoFrame()).toBeNull()
})

const frame = (result) => ({ executeJavaScript: vi.fn(async () => result) })

it('pega o quadro direto do elemento de vídeo, sem fotografar a janela', async () => {
  const main = frame('data:image/jpeg;base64,QUFB')
  const { context } = load({ frames: [main] })

  expect(await context.captureRemoteVideoFrame()).toBe('QUFB')
  expect(main.executeJavaScript.mock.calls[0][0]).toContain('drawImage')
  expect(context.sourceWindow.webContents.capturePage).not.toHaveBeenCalled()
})

it('vídeo dentro de iframe (YouTube embutido): procura nos quadros filhos', async () => {
  const main = frame(null)
  const inner = frame('data:image/jpeg;base64,QkJC')
  const { context } = load({ frames: [main, inner] })

  expect(await context.captureRemoteVideoFrame()).toBe('QkJC')
  expect(context.sourceWindow.webContents.capturePage).not.toHaveBeenCalled()
})

it('sem acesso ao vídeo (erro ou nada): cai na foto da janela', async () => {
  const broken = { executeJavaScript: vi.fn(async () => { throw new Error('tainted') }) }
  const { context } = load({ frames: [broken, frame(null)] })

  expect(await context.captureRemoteVideoFrame()).toBe(Buffer.from('jpeg').toString('base64'))
  expect(context.sourceWindow.webContents.capturePage).toHaveBeenCalledOnce()
})

it('quadro que nunca responde não trava a prévia; é tentado de novo depois de 3 s', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const stuck = { executeJavaScript: vi.fn(() => new Promise(() => {})) }
  const good = frame('data:image/jpeg;base64,QUFB')
  const { context } = load({ frames: [stuck, good] })

  expect(await context.captureRemoteVideoFrame()).toBe('QUFB')
  expect(await context.captureRemoteVideoFrame()).toBe('QUFB')
  expect(stuck.executeJavaScript).toHaveBeenCalledOnce()

  vi.setSystemTime(Date.now() + 3100)
  await context.captureRemoteVideoFrame()
  expect(stuck.executeJavaScript).toHaveBeenCalledTimes(2)
  vi.useRealTimers()
})

it('página do player ainda carregando: não tenta nada', async () => {
  const main = frame('data:image/jpeg;base64,QUFB')
  const { context } = load({ frames: [main], loading: true })

  expect(await context.captureRemoteVideoFrame()).toBeNull()
  expect(main.executeJavaScript).not.toHaveBeenCalled()
  expect(context.sourceWindow.webContents.capturePage).not.toHaveBeenCalled()
})

it('foto da janela (reserva pesada) sai no máximo a cada 400 ms', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const { context } = load({ frames: [frame(null)] })

  expect(await context.captureRemoteVideoFrame()).not.toBeNull()
  expect(await context.captureRemoteVideoFrame()).toBeNull()
  expect(context.sourceWindow.webContents.capturePage).toHaveBeenCalledOnce()

  vi.setSystemTime(Date.now() + 450)
  expect(await context.captureRemoteVideoFrame()).not.toBeNull()
  vi.useRealTimers()
})


it('anotação aberta no player de texto envia prévia sem procurar vídeo', async () => {
  const video = frame(null)
  const { context } = load({ mode: 'image', text: true, frames: [video] })

  expect(await context.captureRemoteVideoFrame()).toBe(Buffer.from('jpeg').toString('base64'))
  expect(context.sourceWindow.webContents.capturePage).toHaveBeenCalledOnce()
  expect(video.executeJavaScript).not.toHaveBeenCalled()
})
