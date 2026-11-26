import { describe, expect, it } from 'vitest'

import {
  buildDraftFromDroppedPaths,
  detectLiturgyFileType,
  isPresentationPath,
  PRESENTATION_EXTENSIONS,
  titleFromFilePath,
} from '../liturgy-file-detect'

describe('liturgy-file-detect', () => {
  it('detecta áudio, vídeo, imagem, pdf e apresentação', () => {
    expect(detectLiturgyFileType('/a/hino.mp3')).toBe('audio')
    expect(detectLiturgyFileType('C:\\vids\\clipe.MP4')).toBe('video')
    expect(detectLiturgyFileType('foto.webp')).toBe('images')
    expect(detectLiturgyFileType('liturgia.pdf')).toBe('pdf')
    expect(detectLiturgyFileType('slides.PPTX')).toBe('presentation')
    expect(detectLiturgyFileType('texto.docx')).toBe('other_files')
  })

  it('aceita arquivos do LibreOffice e de slideshow como apresentação', () => {
    expect(detectLiturgyFileType('/home/u/culto.odp')).toBe('presentation')
    expect(detectLiturgyFileType('C:\\docs\\Avisos.ODT')).toBe('presentation')
    expect(detectLiturgyFileType('abertura.ppsx')).toBe('presentation')
    expect(detectLiturgyFileType('abertura.pps')).toBe('presentation')
    expect(isPresentationPath(' /a/culto.odp ')).toBe(true)
    expect(isPresentationPath('/a/culto.odp.bak')).toBe(false)
    expect(PRESENTATION_EXTENSIONS).toEqual(
      expect.arrayContaining(['ppt', 'pptx', 'odp', 'odt']),
    )
  })

  it('titleFromFilePath remove extensão e sufixo de YouTube', () => {
    expect(titleFromFilePath('/tmp/Boas_Vindas_1eagQ-91i1c.mp4')).toBe('Boas_Vindas')
    expect(titleFromFilePath('Abertura.pptx')).toBe('Abertura')
  })

  it('várias imagens viram um draft images; outros tipos usam só o primeiro', () => {
    const images = buildDraftFromDroppedPaths(
      ['/a/1.png', '/a/2.jpg'],
      { categoryId: 'cat-1', imagesLabel: (n) => `${n} imgs` },
    )
    expect(images?.draft.type).toBe('images')
    expect(images?.draft.filePaths).toEqual(['/a/1.png', '/a/2.jpg'])
    expect(images?.draft.name).toBe('2 imgs')
    expect(images?.draft.categoryId).toBe('cat-1')
    expect(images?.remainingPaths).toEqual([])

    const mixed = buildDraftFromDroppedPaths(['/a/song.mp3', '/a/slide.pptx'])
    expect(mixed?.draft.type).toBe('audio')
    expect(mixed?.draft.filePath).toBe('/a/song.mp3')
    expect(mixed?.draft.name).toBe('song')
    expect(mixed?.remainingPaths).toEqual(['/a/slide.pptx'])
  })
})
