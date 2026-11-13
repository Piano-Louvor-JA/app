// @vitest-environment node
/** Miniatura do slide atual para o controle remoto: JPEG pequeno, nunca o PNG cheio. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const main = readFileSync(new URL('../ipc/web-projection.mjs', import.meta.url), 'utf8')
const START = 'export async function captureSourcePreviewJpeg('
const END = '/** Avança para o próximo slide da apresentação no popup. */'

function load(frame, size = { width: 1920, height: 1080 }, extra = {}) {
  const small = { toJPEG: vi.fn(() => Buffer.from('jpeg')) }
  const image = {
    isEmpty: () => false,
    getSize: () => size,
    resize: vi.fn(() => small),
    toJPEG: vi.fn(() => Buffer.from('original')),
  }
  const context = {
    Buffer,
    captureSourceFrameBase64: vi.fn(async () => frame),
    nativeImage: { createFromBuffer: vi.fn(() => image), createFromPath: vi.fn(() => image) },
    currentProjectionMode: 'pdf',
    currentImagePaths: [],
    sourceWindow: null,
    isPdfDocumentMode: () => true,
    previewCache: new Map(),
    getImageSlideState: vi.fn(async () => null),
    ...extra,
  }
  runInNewContext(main.slice(main.indexOf(START), main.indexOf(END)).replaceAll('export ', ''), context)
  return { context, image, small }
}

it('reduz o slide para a largura do celular em JPEG', async () => {
  const { context, image, small } = load(Buffer.from('png').toString('base64'))

  const preview = await context.captureSourcePreviewJpeg(480)

  expect(image.resize).toHaveBeenCalledWith({ width: 480, quality: 'good' })
  expect(small.toJPEG).toHaveBeenCalledWith(70)
  expect(preview).toBe(Buffer.from('jpeg').toString('base64'))
})

it('imagem já pequena não é ampliada', async () => {
  const { context, image } = load(Buffer.from('png').toString('base64'), { width: 300, height: 200 })

  await context.captureSourcePreviewJpeg(480)

  expect(image.resize).not.toHaveBeenCalled()
  expect(image.toJPEG).toHaveBeenCalledWith(70)
})

it('sem slide pronto não devolve nada', async () => {
  const { context } = load(null)

  expect(await context.captureSourcePreviewJpeg(480)).toBeNull()
})

it('imagem: lê o arquivo da imagem atual, sem foto da janela', async () => {
  const { context } = load(null, undefined, {
    currentProjectionMode: 'image',
    currentImagePaths: ['/a.jpg', '/b.jpg', '/c.jpg'],
    getImageSlideState: vi.fn(async () => ({ index: 1, total: 3 })),
  })

  const preview = await context.captureSourcePreviewJpeg(480)

  expect(context.nativeImage.createFromPath).toHaveBeenCalledWith('/b.jpg')
  expect(context.captureSourceFrameBase64).not.toHaveBeenCalled()
  expect(preview).toBe(Buffer.from('jpeg').toString('base64'))
})

it('imagem já vista volta na hora, do cache', async () => {
  const { context } = load(null, undefined, {
    currentProjectionMode: 'image',
    currentImagePaths: ['/a.jpg', '/b.jpg'],
    getImageSlideState: vi.fn(async () => ({ index: 0, total: 2 })),
  })

  await context.captureSourcePreviewJpeg(480)
  await context.captureSourcePreviewJpeg(480)

  expect(context.nativeImage.createFromPath).toHaveBeenCalledOnce()
})

it('galeria: miniaturas de todas as imagens, com a chave da galeria', async () => {
  const { context } = load(null, undefined, {
    currentProjectionMode: 'image',
    currentImagePaths: ['/a.jpg', '/b.jpg'],
  })

  const gallery = await context.captureGalleryPreviewsJpeg(480)

  expect(gallery.previews).toHaveLength(2)
  expect(context.nativeImage.createFromPath).toHaveBeenCalledWith('/a.jpg')
  expect(context.nativeImage.createFromPath).toHaveBeenCalledWith('/b.jpg')
  expect(typeof gallery.key).toBe('string')
  expect((await context.captureGalleryPreviewsJpeg(480)).key).toBe(gallery.key)
})

it('galeria grande manda só as primeiras 30', async () => {
  const paths = Array.from({ length: 40 }, (_, i) => `/${i}.jpg`)
  const { context } = load(null, undefined, { currentProjectionMode: 'image', currentImagePaths: paths })

  expect((await context.captureGalleryPreviewsJpeg(480)).previews).toHaveLength(30)
})

it('fora do modo imagem não há galeria', async () => {
  const { context } = load(null)

  expect(await context.captureGalleryPreviewsJpeg(480)).toBeNull()
})

it.each(['pdf', 'presentation'])('%s: obtém miniaturas sem navegar a apresentação', async mode => {
  const gallery = { key: 'doc:4', previews: ['', 'anterior', '', 'proximo'] }
  const executeJavaScript = vi.fn(async () => gallery)
  const { context } = load(null, undefined, {
    currentProjectionMode: mode,
    sourceWindow: { isDestroyed: () => false, webContents: { executeJavaScript } },
  })
  expect(await context.captureGalleryPreviewsJpeg()).toEqual(gallery)
  expect(executeJavaScript.mock.calls[0][0]).toContain('captureGalleryPreviews')
})
