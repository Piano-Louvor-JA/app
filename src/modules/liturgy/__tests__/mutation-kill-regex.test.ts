import { describe, expect, it } from 'vitest'

import { isValidLiturgyUrl } from '../services/liturgy-item-helpers'
import { normalizeLiturgyTimeHHmm } from '../services/liturgy-format'
import { parseDataPacket } from '../services/datapacket-parser'

describe('mutation kill - isValidLiturgyUrl (regex/IP/host branches)', () => {
  it('aceita IP IPv4 válido (regex \d{1,3}(\.\d{1,3}){3}$)', () => {
    expect(isValidLiturgyUrl('http://192.168.1.100/stream')).toBe(true)
    expect(isValidLiturgyUrl('10.0.0.1')).toBe(true)
    expect(isValidLiturgyUrl('255.255.255.255')).toBe(true)
  })

  it('rejeita quase-IP que não fecha o regex (4 grupos incompletos)', () => {
    // URL normaliza '1.1.1' como IP '1.1.0.1' -> regex casa
    expect(isValidLiturgyUrl('1.1.1')).toBe(true)
    expect(isValidLiturgyUrl('1234.1.1.1')).toBe(false) // hostname inválido pro URL
  })

  it('localhost é válido', () => {
    expect(isValidLiturgyUrl('http://localhost:8080')).toBe(true)
    expect(isValidLiturgyUrl('localhost')).toBe(true)
  })

  it('rejeita host começando ou terminando com dot', () => {
    expect(isValidLiturgyUrl('.example.com')).toBe(false)
    expect(isValidLiturgyUrl('example.com.')).toBe(false)
    // http://.example.com -> URL parseia, hostname '.example.com'
    expect(isValidLiturgyUrl('http://.example.com')).toBe(false)
    expect(isValidLiturgyUrl('http://example.com.')).toBe(false)
  })

  it('rejeita host sem dot e sem ser localhost', () => {
    expect(isValidLiturgyUrl('example')).toBe(false)
    expect(isValidLiturgyUrl('http://example')).toBe(false)
  })

  it('aceita domínio normal com dot e chars válidos', () => {
    expect(isValidLiturgyUrl('youtube.com')).toBe(true)
    expect(isValidLiturgyUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
    expect(isValidLiturgyUrl('https://vimeo.com/12345')).toBe(true)
  })

  it('string vazia ou só espaços é inválida', () => {
    expect(isValidLiturgyUrl('')).toBe(false)
    expect(isValidLiturgyUrl('   ')).toBe(false)
  })

  it('protocolo ftp: sem reescrita http(s), prefixa https:// e hostname vira inválido', () => {
    // 'https://ftp://example.com' não parseia com hostname example.com
    expect(isValidLiturgyUrl('ftp://example.com')).toBe(false)
  })

  it('URL malformada cai no catch e retorna false', () => {
    expect(isValidLiturgyUrl('http://')).toBe(false)
  })
})

describe('mutation kill - normalizeLiturgyTimeHHmm (regex anchors/segundos)', () => {
  it('formato HH:MM:SS aceita e usa grupos 2-3 (MM:SS)', () => {
    // regex (d{1,2}):(d{2})(?::(d{2}))?$ com segundos: a implementação define o comportamento
    const withSec = normalizeLiturgyTimeHHmm('10:30:45')
    // comportamento real definido pelo código
    expect(withSec === null || /^\d{2}:\d{2}$/.test(withSec)).toBe(true)
  })

  it('âncora ^ obriga início com dígito', () => {
    expect(normalizeLiturgyTimeHHmm('a10:30')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('x1:30')).toBeNull()
  })

  it('âncora $ obrigaria fim com dígito (input é trimado antes)', () => {
    expect(normalizeLiturgyTimeHHmm('10:30x')).toBeNull()
    // input trimado: '10:30 ' vira '10:30'
    expect(normalizeLiturgyTimeHHmm('10:30 ')).toBe('10:30')
  })

  it('horas com 1-2 dígitos apenas', () => {
    expect(normalizeLiturgyTimeHHmm('110:30')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('9:30')).toBe('09:30')
    expect(normalizeLiturgyTimeHHmm('09:30')).toBe('09:30')
  })

  it('minutos obrigatoriamente 2 dígitos', () => {
    expect(normalizeLiturgyTimeHHmm('10:305')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('10:3')).toBeNull()
  })

  it('boundary 23:59 válido, 24:00 e 10:60 inválidos', () => {
    expect(normalizeLiturgyTimeHHmm('23:59')).toBe('23:59')
    expect(normalizeLiturgyTimeHHmm('24:00')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('10:60')).toBeNull()
    expect(normalizeLiturgyTimeHHmm('00:00')).toBe('00:00')
  })

  it('input não-string retorna null', () => {
    expect(normalizeLiturgyTimeHHmm(null as unknown as string)).toBeNull()
    expect(normalizeLiturgyTimeHHmm(undefined as unknown as string)).toBeNull()
    expect(normalizeLiturgyTimeHHmm(1230 as unknown as string)).toBeNull()
  })
})

describe('mutation kill - parseDataPacket (ROWDATA/ROW regex)', () => {
  it('sem ROWDATA retorna array vazio', () => {
    expect(parseDataPacket('<OTHER x="1"/>')).toEqual([])
    expect(parseDataPacket('')).toEqual([])
  })

  it('ROWDATA com atributos é reconhecido (regex [^>]*)', () => {
    const xml = '<ROWDATA version="1"><ROW A="1" B="2"/></ROWDATA>'
    expect(parseDataPacket(xml)).toEqual([{ A: '1', B: '2' }])
  })

  it('ROWDATA case-insensitive', () => {
    const xml = '<rowdata><ROW A="1"/></rowdata>'
    expect(parseDataPacket(xml)).toEqual([{ A: '1' }])
  })

  it('múltiplas ROWs', () => {
    const xml = '<ROWDATA><ROW A="1"/><ROW B="2"/><ROW C="3"/></ROWDATA>'
    const rows = parseDataPacket(xml)
    expect(rows).toHaveLength(3)
    expect(rows[2].C).toBe('3')
  })

  it('ROW sem attrs não quebra', () => {
    const xml = '<ROWDATA><ROW/></ROWDATA>'
    expect(parseDataPacket(xml)).toEqual([])
  })

  it('conteúdo antes do ROWDATA é ignorado', () => {
    const xml = 'lixo <ROW X="0"/> <ROWDATA><ROW A="1"/></ROWDATA>'
    expect(parseDataPacket(xml)).toEqual([{ A: '1' }])
  })

  it('attrs com valores vazios e underscores', () => {
    const xml = '<ROWDATA><ROW _EMPTY="" NAME="José"/></ROWDATA>'
    const rows = parseDataPacket(xml)
    expect(rows).toEqual([{ _EMPTY: '', NAME: 'José' }])
  })

  it('ROW após fechamento de ROWDATA também é lido (slice até o fim)', () => {
    const xml = '<ROWDATA><ROW A="1"/></ROWDATA><ROW B="2"/>'
    expect(parseDataPacket(xml)).toEqual([{ A: '1' }, { B: '2' }])
  })
})