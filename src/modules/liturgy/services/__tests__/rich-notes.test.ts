// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  filterNotesStyle,
  normalizeTitleColor,
  NOTES_TEXT_COLORS,
  notesHtmlToPlainText,
  plainTextToNotesHtml,
  sanitizeNotesHtml,
} from '../rich-notes'

describe('filterNotesStyle', () => {
  it('mantém só cor, marca-texto, tamanhos fixos, peso, itálico, sublinhado e alinhamento', () => {
    expect(
      filterNotesStyle(
        'COLOR: #FF6D00; background-color: rgba(255, 235, 59, 0.35); font-size: x-large; font-weight: bold; ' +
          'font-style: italic; text-decoration-line: underline; text-align: center',
      ),
    ).toBe(
      'color: #ff6d00; background-color: rgba(255, 235, 59, 0.35); font-size: x-large; font-weight: bold; ' +
        'font-style: italic; text-decoration-line: underline; text-align: center;',
    )
  })

  it('descarta propriedades e valores fora da lista', () => {
    expect(
      filterNotesStyle(
        'position: fixed; font-size: 80px; color: url(http://x); background-color: expression(alert(1)); ' +
          'text-align: middle; sem-dois-pontos; text-decoration: underline',
      ),
    ).toBe('text-decoration: underline;')
    expect(filterNotesStyle('')).toBe('')
  })
})

describe('sanitizeNotesHtml', () => {
  it('mantém a formatação do editor', () => {
    const html =
      '<div style="text-align: center;"><b>Almoço</b> na <span style="color: rgb(255, 109, 0);">igreja</span></div>' +
      '<ul><li><i>Sábado</i></li><li><u>JA às 17:00</u></li></ul>'
    expect(sanitizeNotesHtml(html)).toBe(html)
  })

  it('remove scripts, eventos, links, imagens e estilos perigosos', () => {
    const dirty =
      '<div onclick="alert(1)">Oi<script>alert(1)</script>' +
      '<a href="javascript:alert(1)">link</a><img src=x onerror="alert(1)">' +
      '<span style="position: fixed; color: #fff">texto</span><font size="7">grande</font>' +
      '<span style="position: absolute; z-index: 9">!</span></div>'
    expect(sanitizeNotesHtml(dirty)).toBe(
      '<div>Oilink<span style="color: #fff;">texto</span>grande<span>!</span></div>',
    )
  })

  it('vazio quando não sobra texto', () => {
    expect(sanitizeNotesHtml('<div><br></div><p> </p>')).toBe('')
    expect(sanitizeNotesHtml('  ')).toBe('')
    expect(sanitizeNotesHtml(null)).toBe('')
    expect(sanitizeNotesHtml(undefined)).toBe('')
  })
})

describe('notesHtmlToPlainText', () => {
  it('blocos, quebras e listas viram texto legível', () => {
    expect(
      notesHtmlToPlainText(
        '<div><b>Almoço</b>&nbsp;na igreja</div><div><br></div><div>Depois:</div>' +
          '<ol><li>Descanso</li><li>JA<br></li></ol><ul><li>Trazer prato</li></ul><p>Fim</p>',
      ),
    ).toBe('Almoço na igreja\n\nDepois:\n1. Descanso\n2. JA\n• Trazer prato\nFim')
  })

  it('texto solto e quebras em excesso', () => {
    expect(notesHtmlToPlainText('Linha<br><br><br><br>Outra')).toBe('Linha\n\nOutra')
    expect(notesHtmlToPlainText('')).toBe('')
    expect(notesHtmlToPlainText('<div>Antes<!-- comentário --> depois</div>')).toBe('Antes depois')
  })
})

describe('plainTextToNotesHtml', () => {
  it('uma linha por bloco, com escape', () => {
    expect(plainTextToNotesHtml('Almoço & <JA>\n\n"17:00"')).toBe(
      '<div>Almoço &amp; &lt;JA&gt;</div><div><br></div><div>&quot;17:00&quot;</div>',
    )
    expect(plainTextToNotesHtml('  ')).toBe('')
  })

  it('ida e volta preserva o texto', () => {
    const text = 'Neste sábado vamos ter o almoço na igreja\n\ne após teremos o JA as 17:00'
    expect(notesHtmlToPlainText(sanitizeNotesHtml(plainTextToNotesHtml(text)))).toBe(text)
  })
})

describe('normalizeTitleColor', () => {
  it('aceita hex de 6 dígitos, normalizado; o resto vira vazio', () => {
    expect(normalizeTitleColor(' #FFEE58 ')).toBe('#ffee58')
    expect(normalizeTitleColor('#fff')).toBe('')
    expect(normalizeTitleColor('red')).toBe('')
    expect(normalizeTitleColor('#ffee58; background: red')).toBe('')
    expect(normalizeTitleColor(null)).toBe('')
    expect(normalizeTitleColor(42)).toBe('')
  })

  it('a paleta só tem cores válidas', () => {
    expect(NOTES_TEXT_COLORS.every((color) => normalizeTitleColor(color) === color)).toBe(true)
  })
})
