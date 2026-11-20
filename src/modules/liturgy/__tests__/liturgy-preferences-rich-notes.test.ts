// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { normalizeLiturgyState } from '../services/liturgy-preferences'

function sundayWith(items: unknown[]) {
  return normalizeLiturgyState({ weekdays: { sunday: items } }).weekdays.sunday
}

describe('liturgia salva — anotações formatadas e tipos sem duração', () => {
  it('anotação mantém o texto formatado, limpo; outros tipos descartam', () => {
    const [annotation, site] = sundayWith([
      {
        id: 'a', type: 'annotation', name: 'Almoço', subtitle: 'Almoço na igreja',
        notesHtml: '<div><b>Almoço</b><script>alert(1)</script></div>',
      },
      { id: 's', type: 'site', name: 'Site', url: 'https://x.org', notesHtml: '<b>x</b>' },
    ])
    expect(annotation!.notesHtml).toBe('<div><b>Almoço</b></div>')
    expect(annotation!.subtitle).toBe('Almoço na igreja')
    expect(site).not.toHaveProperty('notesHtml')
  })

  it('anotação sem texto formatado não ganha o campo', () => {
    const [annotation] = sundayWith([{ id: 'a', type: 'annotation', name: 'Aviso', notesHtml: '<div><br></div>' }])
    expect(annotation).not.toHaveProperty('notesHtml')
  })

  it('cor do título: só anotação guarda, e só uma cor válida', () => {
    const [valid, invalid, site] = sundayWith([
      { id: 'a', type: 'annotation', name: 'Aviso', titleColor: ' #FFEE58 ' },
      { id: 'b', type: 'annotation', name: 'Aviso', titleColor: 'red' },
      { id: 's', type: 'site', name: 'Site', url: 'https://x.org', titleColor: '#ffee58' },
    ])
    expect(valid!.titleColor).toBe('#ffee58')
    expect(invalid).not.toHaveProperty('titleColor')
    expect(site).not.toHaveProperty('titleColor')
  })

  it('anotações, imagens, PDFs, apresentações e sites antigos carregam sem duração', () => {
    const items = sundayWith(
      ['annotation', 'images', 'pdf', 'presentation', 'site', 'video'].map((type) => ({
        id: type, type, name: type, durationMs: 300_000,
      })),
    )
    expect(items.map((item) => [item.type, item.durationMs])).toEqual([
      ['annotation', 0], ['images', 0], ['pdf', 0], ['presentation', 0], ['site', 0], ['video', 300_000],
    ])
  })
})
