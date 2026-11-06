// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { notesHtmlToPlainText, sanitizeNotesHtml } from '../rich-notes'

describe('notas formatadas fora do navegador', () => {
  it('sem DOM não há como limpar o HTML: descarta a formatação', () => {
    expect(sanitizeNotesHtml('<b>Oi</b>')).toBe('')
  })

  it('texto puro ainda sai, sem as tags', () => {
    expect(notesHtmlToPlainText('<b>Oi</b> mundo')).toBe('Oi mundo')
  })
})
