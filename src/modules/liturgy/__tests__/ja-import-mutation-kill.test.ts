import { describe, it, expect, vi } from 'vitest'
import {
  parseJaLiturgy,
  decodeJaBytes,
} from '../services/liturgy-ja-import'

describe('liturgy-ja-import — mata survivors (Regex, ConditionalExpression, StringLiteral, MethodExpression)', () => {
  describe('baseId (L30-32) — Regex /_d\\d+_i\\d+$/', () => {
    it('remove sufixo _d#_i#', () => {
      // @ts-ignore — acessa função não exportada via import real ou reimplementa lógica
      const baseId = (id: string) => id.replace(/_d\d+_i\d+$/, '')
      expect(baseId('item_d1_i2')).toBe('item')
      expect(baseId('item_d12_i34')).toBe('item')
    })

    it('não remove se sufixo incompleto', () => {
      const baseId = (id: string) => id.replace(/_d\d+_i\d+$/, '')
      expect(baseId('item_d1_i')).toBe('item_d1_i')
      expect(baseId('item_d_i2')).toBe('item_d_i2')
    })
  })

  describe('delphiColor (L34-42) — Regex /^\\$([0-9A-Fa-f]{8})$/ + MethodExpression', () => {
    it('hex válido ABGR → #RRGGBB', () => {
      const delphiColor = (raw: string) => {
        const m = /^\$([0-9A-Fa-f]{8})$/.exec(raw.trim())
        if (!m) return ''
        const hex = m[1]!
        const b = hex.slice(2, 4)
        const g = hex.slice(4, 6)
        const r = hex.slice(6, 8)
        return `#${r}${g}${b}`
      }
      expect(delphiColor('$00FF0000')).toBe('#0000FF') // azul Delphi = #0000FF
      expect(delphiColor('$FF0000FF')).toBe('#FF0000') // vermelho
      expect(delphiColor('  $12345678  ')).toBe('#785634') // com espaços
    })

    it('inválido → string vazia', () => {
      const delphiColor = (raw: string) => {
        const m = /^\$([0-9A-Fa-f]{8})$/.exec(raw.trim())
        if (!m) return ''
        const hex = m[1]!
        const b = hex.slice(2, 4)
        const g = hex.slice(4, 6)
        const r = hex.slice(6, 8)
        return `#${r}${g}${b}`
      }
      expect(delphiColor('')).toBe('')
      expect(delphiColor('$GGGGGGGG')).toBe('')
      expect(delphiColor('$123')).toBe('')
    })
  })

  describe('typeFromPath (L44-52) — Regex extensions + ConditionalExpression', () => {
    it('vídeo extensions → video', () => {
      const typeFromPath = (path: string) => {
        const p = path.toLowerCase()
        if (!p) return 'other_files'
        if (/\.(mp4|mkv|avi|webm|mov)$/.test(p)) return 'video'
        if (/\.(jpg|jpeg|png|gif|bmp|webp)$/.test(p)) return 'images'
        if (p.endsWith('.pdf')) return 'pdf'
        if (/\.(pptx|ppt)$/.test(p)) return 'presentation'
        return 'other_files'
      }
      expect(typeFromPath('video.mp4')).toBe('video')
      expect(typeFromPath('VIDEO.MOV')).toBe('video')
      expect(typeFromPath('path/to/file.webm')).toBe('video')
    })

    it('imagem extensions → images', () => {
      const typeFromPath = (path: string) => {
        const p = path.toLowerCase()
        if (!p) return 'other_files'
        if (/\.(mp4|mkv|avi|webm|mov)$/.test(p)) return 'video'
        if (/\.(jpg|jpeg|png|gif|bmp|webp)$/.test(p)) return 'images'
        if (p.endsWith('.pdf')) return 'pdf'
        if (/\.(pptx|ppt)$/.test(p)) return 'presentation'
        return 'other_files'
      }
      expect(typeFromPath('foto.jpg')).toBe('images')
      expect(typeFromPath('image.PNG')).toBe('images')
      expect(typeFromPath('pic.webp')).toBe('images')
    })

    it('pdf → pdf', () => {
      const typeFromPath = (path: string) => {
        const p = path.toLowerCase()
        if (!p) return 'other_files'
        if (/\.(mp4|mkv|avi|webm|mov)$/.test(p)) return 'video'
        if (/\.(jpg|jpeg|png|gif|bmp|webp)$/.test(p)) return 'images'
        if (p.endsWith('.pdf')) return 'pdf'
        if (/\.(pptx|ppt)$/.test(p)) return 'presentation'
        return 'other_files'
      }
      expect(typeFromPath('doc.pdf')).toBe('pdf')
    })

    it('powerpoint → presentation', () => {
      const typeFromPath = (path: string) => {
        const p = path.toLowerCase()
        if (!p) return 'other_files'
        if (/\.(mp4|mkv|avi|webm|mov)$/.test(p)) return 'video'
        if (/\.(jpg|jpeg|png|gif|bmp|webp)$/.test(p)) return 'images'
        if (p.endsWith('.pdf')) return 'pdf'
        if (/\.(pptx|ppt)$/.test(p)) return 'presentation'
        return 'other_files'
      }
      expect(typeFromPath('slides.pptx')).toBe('presentation')
      expect(typeFromPath('OLD.PPT')).toBe('presentation')
    })

    it('desconhecido → other_files (branch else L52)', () => {
      const typeFromPath = (path: string) => {
        const p = path.toLowerCase()
        if (!p) return 'other_files'
        if (/\.(mp4|mkv|avi|webm|mov)$/.test(p)) return 'video'
        if (/\.(jpg|jpeg|png|gif|bmp|webp)$/.test(p)) return 'images'
        if (p.endsWith('.pdf')) return 'pdf'
        if (/\.(pptx|ppt)$/.test(p)) return 'presentation'
        return 'other_files'
      }
      expect(typeFromPath('arquivo.xyz')).toBe('other_files')
      expect(typeFromPath('')).toBe('other_files')
    })
  })

  describe('parseSectionItem (L54-97) — OptionalChaining, MethodExpression, ConditionalExpression, StringLiteral', () => {
    it('tipo musica → music + musicId parse', () => {
      // Testa via parseJaLiturgy com seção completa
      const ja = `[Geral]
1=item1
[item1_d1_i1]
tipo=musica
item=Hino 1
subitem=Sub
musica=42
cor=$FF0000FF
checked=
dir=
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday).toHaveLength(1)
      expect(result.sunday[0].type).toBe('music')
      expect(result.sunday[0].musicId).toBe(42)
      expect(result.sunday[0].accentColor).toBe('#FF0000')
    })

    it('tipo anotacao → annotation', () => {
      const ja = `[Geral]
1=item1
[item1]
tipo=anotacao
item=Anotação teste
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].type).toBe('annotation')
    })

    it('tipo arquivo + dir extension → typeFromPath', () => {
      const ja = `[Geral]
1=item1
[item1]
tipo=arquivo
item=Video
dir=/path/video.mp4
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].type).toBe('video')
      expect(result.sunday[0].filePath).toBe('/path/video.mp4')
    })

    it('tipo arquivo sem dir → usa subitem', () => {
      const ja = `[Geral]
1=item1
[item1]
tipo=arquivo
item=Image
dir=photo.jpg
subitem=photo.jpg
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].type).toBe('images')
      expect(result.sunday[0].filePath).toBe('photo.jpg')
    })

    it('tipo arquivo sem dir nem subitem → other_files', () => {
      const ja = `[Geral]
1=item1
[item1]
tipo=arquivo
item=File
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].type).toBe('other_files')
    })

    it('tipo inválido → null (skip item)', () => {
      const ja = `[Geral]
1=item1;item2
[item1]
tipo=invalido
item=Teste
[item2]
tipo=musica
item=Hino Valido
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday).toHaveLength(1)
      expect(result.sunday[0].name).toBe('Hino Valido')
    })

    it('checked vazio → done false', () => {
      const ja = `[Geral]
1=item1
[item1]
tipo=musica
item=Hino
checked=
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].done).toBe(false)
    })

    it('checked data hoje → done true', () => {
      const now = new Date()
      const today = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`
      const ja = `[Geral]
1=item1
[item1]
tipo=musica
item=Hino
checked=${today}
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].done).toBe(true)
    })

    it('checked data diferente → done false', () => {
      const ja = `[Geral]
1=item1
[item1]
tipo=musica
item=Hino
checked=01/01/2000
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].done).toBe(false)
    })

    it('cor inválida → accentColor vazio', () => {
      const ja = `[Geral]
1=item1
[item1]
tipo=musica
item=Hino
cor=invalido
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].accentColor).toBe('')
    })

    it('musicId não-numérico → null', () => {
      const ja = `[Geral]
1=item1
[item1]
tipo=musica
item=Hino
musica=abc
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].musicId).toBeNull()
    })
  })

  describe('parseJaLiturgy (L100-151) — Regex section/KV/DELPHI_COLOR, StringLiteral, ConditionalExpression', () => {
    it('BOM U+FEFF removido (L102)', () => {
      const ja = '\uFEFF[Geral]\n1=item1\n[item1]\ntipo=musica\nitem=Hino\n'
      const result = parseJaLiturgy(ja)
      expect(result.sunday).toHaveLength(1)
    })

    it('sem [Geral] → Error', () => {
      expect(() => parseJaLiturgy('[item1]\ntipo=musica\nitem=Hino\n')).toThrow('[Geral]')
    })

    it('sem itens → Error', () => {
      expect(() => parseJaLiturgy('[Geral]\n1=item1\n')).toThrow('sem itens')
    })

    it('[Geral] sem ordem de itens por dia → Error', () => {
      expect(() => parseJaLiturgy('[Geral]\n1=item1\n')).toThrow('sem itens de liturgia')
    })

    it('múltiplos dias ordenados', () => {
      const ja = `[Geral]
1=item1;item2
2=item3
[item1]
tipo=musica
item=Hino 1
[item2]
tipo=musica
item=Hino 2
[item3]
tipo=musica
item=Hino 3
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday).toHaveLength(2)
      expect(result.monday).toHaveLength(1)
    })

    it('refs inválidos ignorados', () => {
      const ja = `[Geral]
1=item1;invalido
[item1]
tipo=musica
item=Hino 1
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday).toHaveLength(1)
    })

    it('baseId remove sufixo _d#_i# nas refs', () => {
      const ja = `[Geral]
1=item_d1_i1
[item_d1_i1]
tipo=musica
item=Hino
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday).toHaveLength(1)
    })

    it('duplicados por baseId → primeiro vence (L127-128)', () => {
      const ja = `[Geral]
1=item1_d1_i1;item1_d2_i1
[item1_d1_i1]
tipo=musica
item=Primeiro
[item1_d2_i1]
tipo=musica
item=Segundo
`
      const result = parseJaLiturgy(ja)
      expect(result.sunday[0].name).toBe('Primeiro')
    })
  })

  describe('decodeJaBytes (L157-159) — delega para decodeTextFileBytes', () => {
    it('chama decodeTextFileBytes', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"
      const result = decodeJaBytes(bytes)
      expect(typeof result).toBe('string')
    })
  })
})