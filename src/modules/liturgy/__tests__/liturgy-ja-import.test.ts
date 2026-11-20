import { describe, expect, it } from 'vitest'

import { decodeJaBytes, parseJaLiturgy } from '../services/liturgy-ja-import'

const sample = [
  '[item_20260704084840569]',
  'tipo=musica',
  'item=Momentos de louvor',
  'cor=$004F0000',
  'musica=1660',
  'subtipo=div',
  'subitem=Música Missão (Adoradores 4)',
  'checked=22/08/2026',
  '',
  '[item_20260704085317501]',
  'tipo=arquivo',
  'item=Abertura escola sabatina',
  'cor=$004F0000',
  'subtipo=arq',
  'subitem=Arquivo C:\\Users\\iasdn\\Videos\\video.mp4',
  'dir=C:\\Users\\iasdn\\Videos\\video.mp4',
  'checked=',
  '',
  '[item_20260704085517828]',
  'tipo=anotacao',
  'item=Oração',
  '',
  '[Geral]',
  '7=item_20260704084840569;item_20260704085317501;item_20260704085517828;',
  '6=item_20260704084840569_d6_i0;',
].join('\r\n')

describe('decodeJaBytes', () => {
  it('UTF-8 válido decodifica direto', () => {
    const bytes = new TextEncoder().encode('Música')
    expect(decodeJaBytes(bytes)).toBe('Música')
  })

  it('ANSI (cp1252) decodifica com acentos', () => {
    // 'Música' em cp1252: M \xFA s i c a
    const bytes = Uint8Array.from([0x4d, 0xfa, 0x73, 0x69, 0x63, 0x61])
    expect(decodeJaBytes(bytes)).toBe('Música')
  })
})

const CRLF = String.fromCharCode(13, 10)
const BS = String.fromCharCode(92)

describe('parseJaLiturgy', () => {
  it('parse completo: dias, tipos, campos', () => {
    const map = parseJaLiturgy(sample)
    expect(map.saturday).toHaveLength(3)
    const [music, file, annotation] = map.saturday!
    expect(music.type).toBe('music')
    expect(music.musicId).toBe(1660)
    expect(music.done).toBe(false) // checked=22/08/2026 != hoje
    expect(music.accentColor).toBe('#00004F')
    expect(file.type).toBe('video')
    expect(file.filePath).toContain('video.mp4')
    expect(file.done).toBe(false)
    expect(annotation.type).toBe('annotation')
  })

  it('dedup: _d6_i0 resolve pro mesmo item', () => {
    const map = parseJaLiturgy(sample)
    expect(map.friday).toHaveLength(1)
    expect(map.friday![0]!.id).toBe(map.saturday![0]!.id)
  })

  it('BOM não quebra o parse', () => {
    const map = parseJaLiturgy('﻿' + sample)
    expect(map.saturday).toHaveLength(3)
  })

  it('linha de conteúdo fora de seção e KV sem valor são ignorados/tolerados', () => {
    // "órfã" antes de qualquer [seção] → ignorada; "semvalor=" → valor ''
    const text = [
      'orfa=antes-de-tudo', // sem current → continue
      '[geral]',
      '7=item_x', // sábado
      'titulo=Livro',
      'semvalor=',
      '[item_x]',
      'tipo=musica',
      'musica=1',
    ].join('\n')
    const map = parseJaLiturgy(text)
    expect(map.saturday).toHaveLength(1)
  })

  it('sem [Geral] lança', () => {
    expect(() => parseJaLiturgy('[item_x]\ntipo=musica\nitem=A\n')).toThrow()
  })

  it('extensão decide tipo', () => {
    expect(
      parseJaLiturgy(sample.replaceAll('video.mp4', 'slides.pptx'))
        .saturday![1]!.type,
    ).toBe('presentation')
  })

  it('arquivo sem dir: filePath undefined e tipo vem do subitem; extensões cobrem imagens/pdf/outros', () => {
    const noDir = parseJaLiturgy(
      sample.replaceAll('dir=C:\\Users\\iasdn\\Videos\\video.mp4\r\n', ''),
    )
    expect(noDir.saturday![1]!.type).toBe('video')
    expect(noDir.saturday![1]!.filePath).toBeUndefined()

    const t = (ext: string) =>
      parseJaLiturgy(sample.replaceAll('video.mp4', `x${ext}`)).saturday![1]!.type
    expect(t('.jpg')).toBe('images')
    expect(t('.PDF')).toBe('pdf')
    expect(t('.zip')).toBe('other_files')
    // caminho totalmente vazio (tipo=arquivo sem dir nem subitem) → other_files
    const empty = parseJaLiturgy(
      sample
        .replaceAll('video.mp4', '')
        .replaceAll(`subitem=Arquivo C:${BS}Users${BS}iasdn${BS}Videos${BS}${CRLF}`, CRLF)
        .replaceAll(`dir=C:${BS}Users${BS}iasdn${BS}Videos${BS}${CRLF}`, CRLF)
    )
    expect(empty.saturday![1]!.type).toBe('other_files')
  })

  it('checked de hoje marca done=true', () => {
    const now = new Date()
    const hoje = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
    const map = parseJaLiturgy(sample.replaceAll('checked=22/08/2026', `checked=${hoje}`))
    expect(map.saturday![0]!.done).toBe(true)
  })

  it('tipo desconhecido descarta item', () => {
    const map = parseJaLiturgy(sample + '\n[item_x]\ntipo=outro\nitem=X\n')
    expect(map.saturday).toHaveLength(3)
  })

  it('sem itens válidos lança', () => {
    expect(() =>
      parseJaLiturgy('[Geral]\n1=x\n[item_x]\ntipo=outro\nitem=X\n'),
    ).toThrow('sem itens')
  })

  it('refs desconhecidas/vazias são ignoradas; dia só entra com lista não-vazia', () => {
    // item existente + ref desconhecida: só o válido entra
    const map = parseJaLiturgy(
      '[item_a]\ntipo=musica\nitem=A\n[Geral]\n3=item_a;nao_existe;\n4=\n',
    )
    expect(map.tuesday).toHaveLength(1)
    expect(map.wednesday).toBeUndefined()
    // só refs que não resolvem → [Geral] sem ordem
    expect(() =>
      parseJaLiturgy('[item_a]\ntipo=musica\nitem=A\n[Geral]\n9=x\n'),
    ).toThrow('[Geral] sem ordem')
  })

  it('linhas antes de qualquer seção são ignoradas', () => {
    const map = parseJaLiturgy('chave_sem_secao=1\n' + sample)
    expect(map.saturday).toHaveLength(3)
  })

  it('item sem name nem subitem cai em name vazio; cor inválida gera accent vazio', () => {
    const map = parseJaLiturgy(
      '[item_b]\ntipo=musica\n[Geral]\n1=item_b\n',
    )
    expect(map.sunday![0]!.name).toBe('')
    expect(map.sunday![0]!.accentColor).toBe('')
    expect(map.sunday![0]!.musicId).toBeNull()
  })

  it('seção repetida substitui a anterior (Map.set)', () => {
    const map = parseJaLiturgy(
      '[Geral]\n1=item_c\n[Geral]\n2=item_c\n[item_c]\ntipo=musica\nitem=C\n',
    )
    expect(map.monday).toHaveLength(1)
    expect(map.sunday).toBeUndefined()
  })
})
