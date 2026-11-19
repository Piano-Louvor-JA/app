import { describe, expect, it } from 'vitest'

import { MAX_FILE_TITLE_CHARS, editableFileTitle, sanitizeFileTitle, videoFileName } from '../services/video-file-name'

const ID = 'JHXM432zwwo'

describe('prévia do nome do arquivo baixado', () => {
  it('mesma regra do main: sem acento nem símbolo, ID no fim', () => {
    expect(videoFileName('ADORADORES 5 - ÉS O AR QUE EU RESPIRO (LETRA)', ID)).toBe(`ADORADORES 5 ES O AR QUE EU RESPIRO LETRA_${ID}.mp4`)
    expect(videoFileName('a<b>c:d"e/f\\g|h?i*j', ID)).toBe(`a b c d e f g h i j_${ID}.mp4`)
    expect(videoFileName('!!!', ID)).toBe(`${ID}.mp4`)
    expect(sanitizeFileTitle('x'.repeat(200))).toHaveLength(MAX_FILE_TITLE_CHARS)
  })

  it('parte editável: o que vem antes do _ID', () => {
    expect(editableFileTitle(`Arautos do Rei_${ID}.mp4`, ID)).toBe('Arautos do Rei')
    expect(editableFileTitle(`${ID}.mp4`, ID)).toBe('')
    expect(editableFileTitle('Outro nome.mp4', ID)).toBe('Outro nome')
    expect(editableFileTitle(undefined, ID)).toBe('')
  })
})
