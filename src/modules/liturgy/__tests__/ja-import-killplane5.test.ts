import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseJaLiturgy } from '../services/liturgy-ja-import'

/**
 * Kill plane 5 liturgy-ja-import:
 * #81 padStart do dia (fake time com dia < 10)
 * #141/#142/#144 BOM literal no source: arquivo iniciando com \ufeff.
 *   ATENÇÃO: a string de teste usa '\uFEFF' escape — o source usa literal.
 */

const MUSIC = 'tipo=musica\nitem=H\nmusica=1\n'

function jaWith(sections: string, geral = '1=item1'): string {
  return `[Geral]\n${geral}\n${sections}`
}

afterEach(() => {
  vi.useRealTimers()
})

describe('#81 padStart — dia < 10', () => {
  it('checked com data de dia 5 marca done (dd com zero à esquerda)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 5, 12, 0, 0)) // 05/09/2026
    const ja = `[Geral]\n1=item1;item2\n[item1]\n${MUSIC}checked=05/09/2026\n[item2]\n${MUSIC}checked=5/09/2026\n`
    const r = parseJaLiturgy(ja)
    expect(r.sunday?.[0]?.done).toBe(true) // '05/09/2026' == dd/mm/yyyy com pad
    expect(r.sunday?.[1]?.done).toBe(false) // sem pad não é igual
  })
})

describe('#141/#142/#144 — BOM literal', () => {
  it('arquivo com BOM real (\uFEFF) parseia igual', () => {
    const ja = '\uFEFF' + jaWith(`[item1]\n${MUSIC}`)
    const r = parseJaLiturgy(ja)
    expect(r.sunday?.[0]?.name).toBe('H')
  })
})

/*
 * EQUIVALENTES documentados (auditoria run 19/09 — ja-import 14/14 survivors):
 * #1746 L46 !p → false: typeFromPath('') cai nos regexes (todos falham) e
 *       retorna other_files no final — mesmo resultado do early-return.
 * #1779 L61 checked ?? '': default só flui pro isDoneToday, que compara com
 *       data de hoje — qualquer string não-data → false, igual ao ''.
 * #1784 L67 !v → false: v='' → compare com dd/mm/yyyy falha → false, igual.
 * #1795 L74 cor ?? '': delphiColor() sanitiza (regex não casa → ''), mesmo
 *       resultado com qualquer default.
 * #1798 L76 musica ?? '': parseInt(default) → NaN nos dois casos.
 * #1846/1847/1849 L102 BOM startsWith/endsWith/slice: String.trim() do JS
 *       REMOVE U+FEFF (ZWNBSP é WhiteSpace na spec ECMAScript) — a linha
 *       '\uFEFF[Geral]' é trimada pra '[Geral]' antes do SECTION_RE, então o
 *       slice(1) é redundante. Provado com mutação manual + vitest (106/106).
 * #1855 L108 !line → false: linha vazia não casa SECTION_RE nem KV_RE e não
 *       é comentário → ignorada adiante, mesmo fluxo.
 * #1872/1874 L125 sectionId 'geral' continue: seção geral nunca tem tipo= →
 *       parseSectionItem retorna null → item nunca criado, com ou sem continue.
 * #1895 L141 !id → false: ref vazia → itemsById.get('') → undefined → !item
 *       não empurra, mesmo fluxo.
 * #1716/1717 L27 KV_RE âncoras ^/$: line já vem trimada (L107) e exec testa
 *       da posição 0 primeiro — âncoras redundantes. Provado com mutação
 *       manual + vitest (72/72).
 */
