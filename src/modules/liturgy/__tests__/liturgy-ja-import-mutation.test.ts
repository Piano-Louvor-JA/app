import { describe, expect, it } from 'vitest'

import { parseJaLiturgy } from '../services/liturgy-ja-import'

describe('liturgy-ja-import - mutation kill', () => {
  describe('parseJaLiturgy - edge cases', () => {
    it('handles CRLF and LF line endings', () => {
      const text = '[Geral]\r\n1=item_a\r\n[item_a]\ntipo=musica\nitem=A\n'
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(1)
    })

    it('handles mixed CRLF/LF', () => {
      const text = '[Geral]\n1=item_a\r\n[item_a]\r\ntipo=musica\r\nitem=A\n'
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(1)
    })

    it('ignores empty lines and whitespace-only lines', () => {
      const text = '\n\r\n   \n[Geral]\n1=item_a\n\n[item_a]\n\ntipo=musica\n\nitem=A\n'
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(1)
    })

    it('handles section name case-insensitive', () => {
      const text = '[GERAL]\n1=item_a\n[ITEM_A]\ntipo=musica\nitem=A\n'
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(1)
    })

    it('handles key case-insensitive', () => {
      const text = '[Geral]\n1=item_a\n[ITEM_A]\nTIPO=musica\nITEM=A\n'
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(1)
    })

    it('handles item with only subitem (no item field)', () => {
      const text = '[Geral]\n1=item_a\n[item_a]\ntipo=musica\nsubitem=Only Subitem\n'
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.name).toBe('Only Subitem')
    })

    it('handles item with neither item nor subitem (empty name)', () => {
      const text = '[Geral]\n1=item_a\n[item_a]\ntipo=musica\n'
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.name).toBe('')
    })

    it('handles checked date parsing - invalid format', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\nchecked=invalid\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.done).toBe(false)
    })

    it('handles checked date in future', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\nchecked=31/12/2099\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.done).toBe(false)
    })

    it('handles checked date in past', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\nchecked=01/01/2000\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.done).toBe(false)
    })

    it('handles musica with invalid musicId (NaN)', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\nmusica=abc\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.musicId).toBeNull()
    })

    it('handles musica with negative musicId (parseInt returns -1 but isFinite is true, so musicId stays -1)', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\nmusica=-1\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.musicId).toBe(-1) // Number.isFinite(-1) === true
    })

    it('handles arquivo with dir but unknown extension', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=arquivo\nitem=A\ndir=/path/file.xyz\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.type).toBe('other_files')
      expect(map.sunday![0]!.filePath).toBe('/path/file.xyz')
    })

    it('handles arquivo with subitem having extension when dir missing', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=arquivo\nitem=A\nsubitem=doc.pdf\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.type).toBe('pdf')
      expect(map.sunday![0]!.filePath).toBeUndefined()
    })

    it('handles anotação type', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=anotacao\nitem=My Note\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.type).toBe('annotation')
    })

    it('handles duplicate section - second replaces first', () => {
      const text = '[Geral]\n1=item_a\n[ITEM_A]\ntipo=musica\nitem=First\n[ITEM_A]\ntipo=musica\nitem=Second\n'
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(1)
      expect(map.sunday![0]!.name).toBe('Second')
    })

    it('handles multiple days in [Geral]', () => {
      const text = `[Geral]\n1=item_a\n2=item_b\n7=item_c\n[item_a]\ntipo=musica\nitem=A\n[item_b]\ntipo=anotacao\nitem=B\n[item_c]\ntipo=arquivo\nitem=C\ndir=/c.mp4\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(1)
      expect(map.monday).toHaveLength(1)
      expect(map.saturday).toHaveLength(1)
      expect(map.tuesday).toBeUndefined()
    })

    it('handles ref with whitespace', () => {
      const text = `[Geral]\n1= item_a ; item_b \n[item_a]\ntipo=musica\nitem=A\n[item_b]\ntipo=anotacao\nitem=B\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(2)
    })

    it('throws when [Geral] missing', () => {
      expect(() => parseJaLiturgy('[item_a]\ntipo=musica\nitem=A\n')).toThrow('sem seção [Geral]')
    })

    it('throws when no valid items', () => {
      expect(() => parseJaLiturgy('[Geral]\n1=item_a\n[item_a]\ntipo=outro\nitem=X\n')).toThrow('sem itens')
    })

    it('throws when [Geral] has no valid refs (refs exist but no items resolve)', () => {
      expect(() => parseJaLiturgy('[Geral]\n1=x\n')).toThrow('Arquivo .ja sem itens de liturgia')
    })

    it('handles musica type with musica field but non-numeric', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\nmusica=not-a-number\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.musicId).toBeNull()
    })

    it('handles filePath undefined when dir empty string', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=arquivo\nitem=A\ndir=\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.filePath).toBeUndefined()
    })

    it('handles subitem with path separators for type detection', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=arquivo\nsubitem=folder/file.mp4\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.type).toBe('video')
    })

    it('handles accentColor from cor with valid Delphi color', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\ncor=$00FF0000\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.accentColor).toBe('#0000FF')
    })

    it('handles accentColor empty when cor invalid', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\ncor=invalid\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.accentColor).toBe('')
    })

    it('handles item ID with _d suffix only (no _i)', () => {
      const text = `[Geral]\n1=item_123_d5\n[item_123_d5]\ntipo=musica\nitem=A\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.id).toBe('ja_item_123_d5')
    })

    it('handles arquivo type with no dir and no subitem extension -> other_files', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=arquivo\nitem=NoPath\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.type).toBe('other_files')
    })

    it('handles item with checked= today marks done=true', () => {
      const now = new Date()
      const hoje = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\nchecked=${hoje}\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.done).toBe(true)
    })

    it('handles filePath with dir containing backslashes (Windows paths)', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=arquivo\nitem=A\ndir=C:\\Users\\test\\video.mp4\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday![0]!.type).toBe('video')
      expect(map.sunday![0]!.filePath).toBe('C:\\Users\\test\\video.mp4')
    })

    it('handles multiple items in same day', () => {
      const text = `[Geral]\n1=item_a;item_b;item_c\n[item_a]\ntipo=musica\nitem=A\n[item_b]\ntipo=anotacao\nitem=B\n[item_c]\ntipo=arquivo\nitem=C\ndir=/c.mp4\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(3)
    })

    it('handles item with cor field having valid Delphi color format', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\ncor=$12345678\n`
      const map = parseJaLiturgy(text)
      // $12345678 -> BGR: 78 56 34 -> RGB: 34 56 78
      // hex: 12 34 56 78, b=34, g=56, r=78 -> #785634
      expect(map.sunday![0]!.accentColor).toBe('#785634')
    })

    it('handles subtype field (ignored in parsing)', () => {
      const text = `[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\nsubtipo=div\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(1)
    })

    it('handles BOM at start', () => {
      const text = '\uFEFF[Geral]\n1=item_a\n[item_a]\ntipo=musica\nitem=A\n'
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(1)
    })

    it('handles day keys outside 1-7 range (ignored, no valid days -> throws)', () => {
      const text = `[Geral]\n0=item_a\n8=item_b\n[item_a]\ntipo=musica\nitem=A\n[item_b]\ntipo=anotacao\nitem=B\n`
      expect(() => parseJaLiturgy(text)).toThrow('[Geral] sem ordem de itens por dia')
    })

    it('handles ref to non-existent item (ignored)', () => {
      const text = `[Geral]\n1=item_a;nonexistent\n[item_a]\ntipo=musica\nitem=A\n`
      const map = parseJaLiturgy(text)
      expect(map.sunday).toHaveLength(1)
      expect(map.sunday![0]!.name).toBe('A')
    })
  })
})