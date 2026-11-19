// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MAX_TITLE_CHARS, isSafeFileBase, sanitizeTitle, videoFileBase } from '../file-name.mjs'

const ID = 'JHXM432zwwo'

describe('nome do arquivo baixado', () => {
  it('título sem acento, símbolo nem pontuação, seguido do ID', () => {
    expect(videoFileBase('ADORADORES 5 - ÉS O AR QUE EU RESPIRO (LETRA)', ID))
      .toBe(`ADORADORES 5 ES O AR QUE EU RESPIRO LETRA_${ID}`)
    expect(videoFileBase('Arautos do Rei | 60 Anos', ID)).toBe(`Arautos do Rei 60 Anos_${ID}`)
    expect(videoFileBase('MEDLEY | @CintiaAlvesOficial, @dilsonedebora', ID))
      .toBe(`MEDLEY CintiaAlvesOficial dilsonedebora_${ID}`)
  })

  it('remove o que o Windows proíbe e o que esconde ou sobe de pasta', () => {
    expect(sanitizeTitle('a<b>c:d"e/f\\g|h?i*j')).toBe('a b c d e f g h i j')
    expect(sanitizeTitle('../../etc/passwd')).toBe('etc passwd')
    expect(sanitizeTitle('.oculto')).toBe('oculto')
    expect(sanitizeTitle('linha\nnova\ttab\u0000nulo')).toBe('linha nova tab nulo')
    expect(sanitizeTitle('Louvor 🙏 ✝️ ção ñ ü')).toBe('Louvor cao n u')
  })

  it('corta títulos longos sem deixar espaço no fim', () => {
    const long = `${'a'.repeat(MAX_TITLE_CHARS - 1)} bbbbbbbbbb`
    const clean = sanitizeTitle(long)
    expect(clean).toBe('a'.repeat(MAX_TITLE_CHARS - 1))
    expect(sanitizeTitle('x'.repeat(500))).toHaveLength(MAX_TITLE_CHARS)
    expect(`${videoFileBase('x'.repeat(500), ID)}.mp4`.length).toBeLessThan(100)
  })

  it('título vazio, só símbolos ou em outra escrita: fica só o ID', () => {
    expect(videoFileBase('', ID)).toBe(ID)
    expect(videoFileBase('!!! ??? ***', ID)).toBe(ID)
    expect(videoFileBase('賛美歌', ID)).toBe(ID)
    expect(videoFileBase(undefined, ID)).toBe(ID)
    expect(videoFileBase(null, ID)).toBe(ID)
  })

  it('aceita do índice só nomes simples', () => {
    expect(isSafeFileBase(`Hino_${ID}`)).toBe(true)
    expect(isSafeFileBase(ID)).toBe(true)
    for (const bad of ['', '../x', 'a/b', 'a\\b', ' x', 'x ', 'a.b', 'x'.repeat(121), 5, null]) {
      expect(isSafeFileBase(bad)).toBe(false)
    }
  })
})
