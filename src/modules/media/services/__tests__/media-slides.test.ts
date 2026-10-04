import { describe, expect, it } from 'vitest'

/**
 * Cobertura de media-slides.ts — parse de tempos, construção de slides
 * (capa + letras, herança de imagem), tempos por modo, índice por tempo,
 * strip HTML e snippet de preview.
 */
import type { MediaLyricSlide, MediaTrackRecord } from '../../types/media'

import {
  parseSlideTimeToSeconds,
  buildMediaSlides,
  buildSlideTimesSec,
  resolveSlideIndexForTime,
  stripHtmlBreaks,
  lyricPreviewSnippet,
} from '../media-slides'

const track = (over: Partial<MediaTrackRecord> = {}): MediaTrackRecord =>
  ({
    id: 1,
    name: 'Faixa',
    durationLabel: '3:00',
    audioUrl: null,
    instrumentalUrl: null,
    coverUrl: 'capa.png',
    coverPosition: 'center',
    albums: [],
    categories: [],
    lyrics: [],
    ...over,
  }) as never as MediaTrackRecord

describe('parseSlideTimeToSeconds', () => {
  it('null/vazio/whitespace -> 0', () => {
    expect(parseSlideTimeToSeconds(null)).toBe(0)
    expect(parseSlideTimeToSeconds(undefined)).toBe(0)
    expect(parseSlideTimeToSeconds('')).toBe(0)
    expect(parseSlideTimeToSeconds('   ')).toBe(0)
  })

  it('HH:MM:SS soma horas; MM:SS multiplica minutos', () => {
    expect(parseSlideTimeToSeconds('01:02:03')).toBe(3723)
    expect(parseSlideTimeToSeconds('02:30')).toBe(150)
  })

  it('partes não numéricas -> 0', () => {
    expect(parseSlideTimeToSeconds('a:b')).toBe(0)
  })

  it('4+ partes -> 0', () => {
    expect(parseSlideTimeToSeconds('1:2:3:4')).toBe(0)
  })

  it('segundos puros: número válido >= 0; negativo/NaN -> 0', () => {
    expect(parseSlideTimeToSeconds('45')).toBe(45)
    expect(parseSlideTimeToSeconds('-3')).toBe(0)
    expect(parseSlideTimeToSeconds('xyz')).toBe(0)
  })
})

describe('buildMediaSlides', () => {
  const lyric = (
    order: number,
    text: string,
    opts: { showSlide?: boolean; imageUrl?: string; imagePosition?: string } = {},
  ) => ({
    order,
    lyric: text,
    showSlide: opts.showSlide ?? true,
    time: '00:10',
    instrumentalTime: '00:05',
    imageUrl: opts.imageUrl ?? null,
    imagePosition: opts.imagePosition ?? null,
    isCover: false,
  })

  it('capa primeira com título; showTitleSlide false esvazia título', () => {
    const slides = buildMediaSlides(track({ name: 'Meu Hino' }))
    expect(slides[0]).toMatchObject({
      order: -1,
      lyric: 'Meu Hino',
      isCover: true,
      imageUrl: 'capa.png',
      imagePosition: 'center',
    })
    const noTitle = buildMediaSlides(track(), { showTitleSlide: false })
    expect(noTitle[0]?.lyric).toBe('')
  })

  it('filtra showSlide false e lyric vazio; herda imagem anterior', () => {
    const slides = buildMediaSlides(
      track({
        lyrics: [
          lyric(1, 'um', { imageUrl: 's1.png', imagePosition: 'top' }),
          lyric(2, 'dois'), // sem imagem: herda s1.png
          lyric(3, 'escondido', { showSlide: false }),
          lyric(4, '   '), // vazio
          lyric(5, 'cinco'),
        ],
      }),
    )
    expect(slides).toHaveLength(4) // capa + 3 letras
    const s2 = slides[2]!
    expect(s2.imageUrl).toBe('s1.png') // herança
    expect(s2.imagePosition).toBe('top')
    expect(s2.isCover).toBe(false)
  })
})

describe('buildSlideTimesSec', () => {
  it('audio usa time; instrumental usa instrumentalTime', () => {
    const slides: MediaLyricSlide[] = [
      {
        order: 0,
        lyric: 'a',
        showSlide: true,
        time: '00:10',
        instrumentalTime: '00:20',
        imageUrl: null,
        imagePosition: null,
        isCover: false,
      },
    ]
    expect(buildSlideTimesSec(slides, 'audio')).toEqual([10])
    expect(buildSlideTimesSec(slides, 'instrumental')).toEqual([20])
  })
})

describe('resolveSlideIndexForTime', () => {
  it('vazio -> 0; cruza marcas em ordem; para no primeiro não atingido', () => {
    expect(resolveSlideIndexForTime([], 100)).toBe(0)
    expect(resolveSlideIndexForTime([0, 10, 20], 15)).toBe(1)
    expect(resolveSlideIndexForTime([0, 10, 20], 25)).toBe(2)
    expect(resolveSlideIndexForTime([0, 10, 20], 5)).toBe(0)
    expect(resolveSlideIndexForTime([10, 20], 0)).toBe(0)
  })
})

describe('stripHtmlBreaks / lyricPreviewSnippet', () => {
  it('br -> newline, tags removidas, trim', () => {
    expect(stripHtmlBreaks('a<br>b<br/>c')).toBe('a\nb\nc')
    expect(stripHtmlBreaks('<b>x</b>')).toBe('x')
    expect(stripHtmlBreaks('  limpo  ')).toBe('limpo')
  })

  it('snippet: curto passa; longo corta com elipses', () => {
    expect(lyricPreviewSnippet('curto')).toBe('curto')
    const long = 'a'.repeat(200)
    const out = lyricPreviewSnippet(long)
    expect(out.length).toBe(120)
    expect(out.endsWith('…')).toBe(true)
    // whitespace colapsado antes de medir
    expect(lyricPreviewSnippet('a\n\n  b', 10)).toBe('a b')
  })
})

describe('ramais defensivos (?? em parts e lyric null)', () => {
  it('parse: arrays com posições nunca undefined via split — ramais ?? equivalentes', () => {
    // split nunca gera holes; os ?? 0 são inalcançáveis por construção.
    // documentado: L13/L16 ?? branches equivalentes.
    expect(parseSlideTimeToSeconds('00:00:00')).toBe(0)
    expect(parseSlideTimeToSeconds('00:00')).toBe(0)
  })

  it('buildMediaSlides: lyric null -> filtrado (ramo ?? )', () => {
    const slides = buildMediaSlides(
      track({
        lyrics: [
          { order: 1, lyric: undefined as never, showSlide: true, time: '00:01', instrumentalTime: '', imageUrl: null, imagePosition: null, isCover: false },
          lyric2(2, 'ok'),
        ],
      }),
    )
    expect(slides).toHaveLength(2) // capa + só a válida
  })

  it('resolveSlideIndex: timesSec com undefined não ocorre por construção (typed) — ramo ?? 0 equivalente', () => {
    expect(resolveSlideIndexForTime([0, 10], 20)).toBe(1)
  })
})

function lyric2(order: number, text: string) {
  return { order, lyric: text, showSlide: true, time: '00:10', instrumentalTime: '00:05', imageUrl: null, imagePosition: null, isCover: false }
}
