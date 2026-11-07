// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@shared/services/workspace-api', () => ({ resolveMediaUrl: (p: string) => `local://media/${p}` }))

import {
  carouselFrameDataUrl,
  carouselObsInput,
  carouselTextHtml,
  clearCarouselFrameCache,
} from '../carousel-obs'
import { CAROUSEL_RUNTIME_STORAGE_KEY } from '../carousel-runtime'

function setRuntime(value: unknown) {
  localStorage.setItem(CAROUSEL_RUNTIME_STORAGE_KEY, JSON.stringify(value))
}

const fetchMock = vi.fn()

beforeEach(() => {
  localStorage.clear()
  clearCarouselFrameCache()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

function okImage(bytes = 'png') {
  return { ok: true, blob: async () => new Blob([bytes], { type: 'image/png' }) }
}

describe('carouselTextHtml', () => {
  it('título e linhas viram <br>, sem linhas vazias e com HTML escapado', () => {
    expect(carouselTextHtml(' Batismo ', 'Sábado às 9h\n\n<b>Todos</b> & "família"')).toBe(
      'Batismo<br>Sábado às 9h<br>&lt;b&gt;Todos&lt;/b&gt; &amp; &quot;família&quot;',
    )
    expect(carouselTextHtml('', 'só texto')).toBe('só texto')
  })
})

describe('carouselObsInput', () => {
  it('parado envia tela vazia', async () => {
    await expect(carouselObsInput()).resolves.toEqual({ text: '' })
  })

  it('slide de texto envia título e texto', async () => {
    setRuntime({ active: true, kind: 'text', title: 'Ceia', text: 'Sábado' })
    await expect(carouselObsInput()).resolves.toEqual({ text: 'Ceia<br>Sábado' })
  })

  it('slide de imagem envia a imagem como frame, lida uma vez só', async () => {
    fetchMock.mockResolvedValue(okImage())
    setRuntime({ active: true, kind: 'image', relativePath: 'modulos/avisos/a/1.png' })
    const first = await carouselObsInput()
    expect(first.text).toBe('')
    expect(first.frameDataUrl).toMatch(/^data:image\/png;base64,/)
    await carouselObsInput()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('local://media/modulos/avisos/a/1.png')
  })

  it('imagem que não abre vira tela vazia', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    setRuntime({ active: true, kind: 'image', relativePath: 'modulos/avisos/a/sumiu.png' })
    await expect(carouselObsInput()).resolves.toEqual({ text: '' })
  })
})

describe('carouselFrameDataUrl', () => {
  it('erro de rede ou arquivo que não é imagem devolve null', async () => {
    fetchMock.mockRejectedValueOnce(new Error('rede'))
    await expect(carouselFrameDataUrl('modulos/avisos/a/1.png')).resolves.toBeNull()
    fetchMock.mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['x'], { type: 'text/plain' }) })
    await expect(carouselFrameDataUrl('modulos/avisos/a/2.txt')).resolves.toBeNull()
  })

  it('cache limitado: a imagem mais antiga sai primeiro', async () => {
    fetchMock.mockImplementation(async () => okImage())
    for (let i = 0; i < 25; i++) await carouselFrameDataUrl(`modulos/avisos/a/${i}.png`)
    expect(fetchMock).toHaveBeenCalledTimes(25)
    await carouselFrameDataUrl('modulos/avisos/a/24.png')
    expect(fetchMock).toHaveBeenCalledTimes(25)
    await carouselFrameDataUrl('modulos/avisos/a/0.png')
    expect(fetchMock).toHaveBeenCalledTimes(26)
  })
})
