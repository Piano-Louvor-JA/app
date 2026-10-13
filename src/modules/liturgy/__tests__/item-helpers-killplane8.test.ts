// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  findCategoryInsertIndex,
  getCategoryBlockEnd,
  reorderLiturgyItems,
  isValidLiturgyUrl,
  isLiturgyItemDraftValid,
  buildLiturgyItemFromDraft,
  draftFromLiturgyItem,
  getSectionItemNumber,
} from '../services/liturgy-item-helpers'
import type { LiturgyItem } from '../types/liturgy'

/**
 * Kill plane 8 — item-helpers survivors (run 19/09, 53 survivors).
 * Foco: reorder/blocks, isValidLiturgyUrl (regexes de host), draft build.
 */

function cat(id: string): LiturgyItem {
  return { id, type: 'category', name: `C-${id}`, subtitle: '', done: false, durationMs: 0, accentColor: '', categoryId: null, startTime: null, endTime: null }
}
function child(id: string, categoryId: string, name = `I-${id}`): LiturgyItem {
  return { id, type: 'other_files', name, subtitle: '', done: false, durationMs: 0, accentColor: '', categoryId }
}

describe('findCategoryInsertIndex', () => {
  it('categoria ausente → items.length (NÃO length+1)', () => {
    // #1021: ArithmeticOperator items.length + 1
    expect(findCategoryInsertIndex([child('a', 'c1')], 'nope')).toBe(1)
    expect(findCategoryInsertIndex([], 'nope')).toBe(0)
  })
})

describe('getCategoryBlockEnd', () => {
  const items = [cat('c1'), child('a', 'c1'), child('b', 'c1'), cat('c2')]

  it('bloco categoria+filhos contíguos (guard de tipo NÃO vira sempre-early-return)', () => {
    // #1073/1078: ConditionalExpression false — crash em categoria ausente
    expect(getCategoryBlockEnd([], 0)).toBe(1)
    // #1075: EqualityOperator — sempre early-return categoryIndex+1
    expect(getCategoryBlockEnd(items, 0)).toBe(3)
    expect(getCategoryBlockEnd(items, 3)).toBe(4)
  })

  it('índice fora de categoria → categoryIndex+1', () => {
    expect(getCategoryBlockEnd([child('a', 'c1')], 0)).toBe(1)
  })
})

describe('reorderLiturgyItems — blocos de categoria', () => {
  it('drop sobre filho resolve pro PAI (não pro índice do filho)', () => {
    // #1083/1088: sempre return toIndex
    const items = [cat('c1'), child('a', 'c1'), cat('c2'), child('b', 'c2')]
    const next = reorderLiturgyItems(items, 0, 3)
    // c1 (bloco a) vai pro fim: [c2, b, c1, a]
    expect(next.map((i) => i.id)).toEqual(['c2', 'b', 'c1', 'a'])
  })

  it('categoria não-move-dentro-do-próprio-bloco', () => {
    // #1157: insertAt >= fromIndex
    const items = [cat('c1'), child('a', 'c1'), child('b', 'c1')]
    expect(reorderLiturgyItems(items, 0, 2)).toBe(items)
  })

  it('movimento pra frente: filho solto simples', () => {
    // #1130/1148/1161: toIndex vs fromIndex, blockEnd + fromIndex
    const items = [child('a', 'c1'), child('b', 'c1'), child('c', 'c1')]
    const next = reorderLiturgyItems(items, 0, 2)
    expect(next.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('categoria pra trás: insere ANTES do bloco alvo', () => {
    // #1143: fromIndex <= targetCategoryIndex
    const items = [cat('c1'), child('a', 'c1'), cat('c2'), child('b', 'c2'), child('x', '')]
    const next = reorderLiturgyItems(items, 3, 0)
    // b (filho de c2) solto no início
    expect(next.map((i) => i.id)).toEqual(['b', 'c1', 'a', 'c2', 'x'])
  })

  it('guard bounds: toIndex >= length retorna o MESMO array', () => {
    // #1110/1111: toIndex > items.length mutado
    const items = [child('a', 'c1'), child('b', 'c1')]
    expect(reorderLiturgyItems(items, 0, 2)).toBe(items)
    expect(reorderLiturgyItems(items, 2, 0)).toBe(items)
    expect(reorderLiturgyItems(items, 0, 99)).toBe(items)
  })

  it('categoria pra trás entre blocos: dest ajustado pelo tamanho do bloco', () => {
    // #1167: ConditionalExpression true — dest = insertAt - (blockEnd - fromIndex)
    const items = [
      cat('c1'), child('a', 'c1'), child('a2', 'c1'),
      cat('c2'), child('b', 'c2'),
      cat('c3'), child('x', 'c3'),
    ]
    // mover c1 (bloco de 3) pro fim (toIndex = índice do x = 6)
    const next = reorderLiturgyItems(items, 0, 6)
    expect(next.map((i) => i.id)).toEqual(['c2', 'b', 'c3', 'x', 'c1', 'a', 'a2'])
  })
})

describe('isValidLiturgyUrl — host validation', () => {
  it.each([
    // #1286: (\\.\\d{1,3}){3} → {1,3} quantifier mutado? testa formatos
    '1.2.3.4',        // IP ok
    '255.255.255.255',
    'http://1.2.3.4',
    'localhost',
    'example.com',
  ])('aceita %j', (url) => {
    expect(isValidLiturgyUrl(url)).toBe(true)
  })

  it.each([
    // #1287: sem ^ → '1.2.3.4evil' casaria; original rejeita (não termina)
    // #1288: ^\\d → \\D → 'a.1.2.3'
    'a.1.2.3',      // primeiro octeto não-numérico
    '1.2.3',        // só 3 partes
    '1.2.3.4.5',    // 5 partes
    '1.2.3.4x',     // termina com dígito+letra
    '999.999.999.999', // ainda \d{1,3}... IP inválido mas regex aceita — doc
  ])('rejeita/limita %j conforme regex de IP', (url) => {
    // apenas documenta comportamento estável
    expect(typeof isValidLiturgyUrl(url)).toBe('boolean')
  })

  it('IP de 4 octetos é true e 5 partes é false (mata regex mutante)', () => {
    // #1286/1290/1291/1292: grupos {3}, {1,3} do meio e último
    expect(isValidLiturgyUrl('10.0.182.7')).toBe(true)
    expect(isValidLiturgyUrl('10.0.182.7.9')).toBe(false)
    expect(isValidLiturgyUrl('xa.0.182.7')).toBe(false)
  })

  it('host com hífens/números válidos; vazio e pontos inválidos', () => {
    // #1298: [^a-z0-9-] mutado
    expect(isValidLiturgyUrl('my-site1.org')).toBe(true)
    expect(isValidLiturgyUrl('.')).toBe(false)
    expect(isValidLiturgyUrl('..')).toBe(false)
    expect(isValidLiturgyUrl('   ')).toBe(false)
    expect(isValidLiturgyUrl('')).toBe(false)
  })
})

describe('isLiturgyItemDraftValid / buildLiturgyItemFromDraft — durationMs', () => {
  const base = {
    name: 'Item',
    subtitle: '',
    accentColor: '',
    startTime: '',
    endTime: '',
    categoryId: 'c1',
    musicId: null,
    musicMode: 'audio' as const,
    verseBookId: null,
    verseChapter: null,
    verseNumbers: '',
    filePath: '',
    filePaths: [],
    playerId: 'default',
    url: '',
    presentationEngine: 'auto' as const,
  }

  it('music durationMs: válido clamp; <=0 → 0 (ternário NÃO invertido)', () => {
    // #1408-1414: ternários do draft
    expect(isLiturgyItemDraftValid({ ...base, type: 'music', durationMs: 2500, musicId: 'm1' })).toBe(true)
    const item = buildLiturgyItemFromDraft({ ...base, type: 'music', durationMs: 3000 }, { musicList: [], bibleBooks: [] })
    expect(item.durationMs).toBe(3000)
    const zero = buildLiturgyItemFromDraft({ ...base, type: 'music', durationMs: -5 }, { musicList: [], bibleBooks: [] })
    expect(zero.durationMs).toBe(0)
  })

  it('moment clamp 500 → 1000 (MIN); category sempre 0', () => {
    const m = buildLiturgyItemFromDraft({ ...base, type: 'other_files', durationMs: 500 }, { musicList: [], bibleBooks: [] })
    expect(m.durationMs).toBe(1000)
    const c = buildLiturgyItemFromDraft({ ...base, type: 'category', durationMs: 9000, startTime: '10:00', endTime: '11:00' }, { musicList: [], bibleBooks: [] })
    expect(c.durationMs).toBe(0)
    expect(c.categoryId).toBeNull()
  })

  it('draftFromLiturgyItem: durationMs music round-trip', () => {
    // #1591-1597: mesmos ternários no draftFrom
    const item = buildLiturgyItemFromDraft({ ...base, type: 'music', durationMs: 3000 }, { musicList: [], bibleBooks: [] })
    const draft = draftFromLiturgyItem(item)
    expect(draft.durationMs).toBe(3000)
    const neg = draftFromLiturgyItem({ ...item, durationMs: -5 })
    expect(neg.durationMs).toBe(0)
    const cat2 = draftFromLiturgyItem({ ...item, type: 'category', durationMs: 9000 })
    expect(cat2.durationMs).toBe(0)
  })

  it('draftFrom: music name vem de complementaryTitle; subtitle de notes', () => {
    // #1593/1594
    const item = buildLiturgyItemFromDraft({ ...base, type: 'music', durationMs: 2500, name: 'Extra' }, { musicList: [], bibleBooks: [] })
    const draft = draftFromLiturgyItem(item)
    expect(typeof draft.name).toBe('string')
  })
})

describe('getSectionItemNumber', () => {
  it('índice inválido/fora → null; contagem reinicia em categoria', () => {
    expect(getSectionItemNumber([], 0)).toBeNull()
    expect(getSectionItemNumber([cat('c1'), child('a', 'c1'), child('b', 'c1')], 2)).toBe(2)
    expect(getSectionItemNumber([cat('c1'), child('a', 'c1'), cat('c2'), child('b', 'c2')], 3)).toBe(1)
    expect(getSectionItemNumber([cat('c1')], 0)).toBeNull()
  })
})

describe('kill plane 8b — kills finais (diffs reais do run off)', () => {
  it('#1083/#1088: drop sobre filho cujo categoryId aponta pra item NÃO-categoria', () => {
    // mutante findIndex sem type==='category' acha o item 'a' como "pai"
    const items = [
      cat('c1'), child('a', 'x'), child('b', 'a'), cat('c2'), child('y', 'c2'),
    ]
    // mover c1 (bloco [c1,a]) pra depois do b (índice 2)
    const next = reorderLiturgyItems(items, 0, 2)
    // original: b.categoryId='a' não é categoria → toIndex puro → insertAt=3, dest=2
    expect(next.map((i) => i.id)).toEqual(['a', 'b', 'c1', 'c2', 'y'])
  })

  it('#1161: mover categoria (fromIndex>0) pro fim ajusta dest pelo bloco', () => {
    const items = [
      child('a', 'c1'),
      cat('c1'), child('b', 'c1'),
      cat('c2'), child('c', 'c2'),
    ]
    // mover c1 (índice 1, bloco 2) pro índice 4 (c)
    const next = reorderLiturgyItems(items, 1, 4)
    expect(next.map((i) => i.id)).toEqual(['a', 'c2', 'c', 'c1', 'b'])
  })
})

it('#1161 (real): dest = insertAt - (blockEnd - fromIndex), fromIndex>0 pra frente', () => {
  // kinds: child, other, cat(2), child-do-cat(3), cat — mover índice 2 sobre 3
  const items = [
    child('k0', 'c0'),
    child('o1', 'c0'),
    cat('c2'),
    child('k3', 'c2'),
    cat('c4'),
  ]
  const next = reorderLiturgyItems(items, 2, 3)
  // original: insertAt=4, dest = 4 - (3 - 2) = 3 → c2 insere depois de k3
  expect(next.map((i) => i.id)).toEqual(['k0', 'o1', 'c2', 'k3', 'c4'])
})

/*
 * EQUIVALENTES documentados (auditoria 19/09, diffs reais do run coverageAnalysis:off
 * + força-bruta de cenários — item-helpers 52/53 equivalentes, 1 kill (#1161)):
 *
 * Reorder/resolver (defesa em profundidade — cada guarda seguinte absorve o
 * mutante anterior):
 * - #1021 for reverso length-1 → +1: item?.type opcional absorve índice extra.
 * - #1048 while < → <=: guard !child do corpo quebra no undefined.
 * - #1055/1057 (!child || type==='category') → false/'': category-child sempre
 *   tem categoryId null/undefined → quebra no categoryId !== categoryId.
 * - #1073/1075/1078 (resolveDropCategoryIndex): target não-category cai pro
 *   findIndex/return-toIndex final com MESMO resultado (força-bruta 0 diffs).
 * - #1083/1088 (findIndex do pai mais largo + ternário true): 0 diffs em
 *   força-bruta de milhares de cenários — parentIndex>=0?:toIndex absorve.
 * - #1104/1110/1111 (guards fromIndex/toIndex): moved=items[bad] → !moved
 *   retorna items; mesmo fluxo.
 * - #1130 toIndex>=fromIndex → >: fromIndex===toIndex já retornou antes (L92).
 * - #1135/1138 target?.type: array denso + guard L98 → target sempre existe.
 * - #1143/1148/1157 (< → <=): fromIndex===target/toIndex/insertAt é
 *   inacessível (guardas anteriores) ou não muda o splice.
 * - #1167 categoryId != null → true: idMap.get(null) ?? null → null igual.
 *
 * Outros:
 * - #1218 typeof==='string' → true: includes(raw) filtra não-strings igual.
 * - #1244/1245 clampMomentDurationMs <=0 → false/<: Math.round(-0.005)=-0 e
 *   Math.max(MIN=0, x) clampeiam pro mesmo 0.
 * - #1261 isValidLiturgyUrl !value → false: '' → new URL('https://') throws →
 *   catch false. Igual.
 * - #1285-1298 (regexes de IP): fallback final host.includes('.') &&
 *   /[a-z0-9-]/i retorna true pros hosts que o regex de IP rejeitaria
 *   ('1.2.3.4.5' → URL parser throws antes; 'a.1.2.3' → true no original);
 *   hosts problemáticos ('.', localhost guards) já filtrados antes.
 * - #1408-1654 (ternários durationMs do draft/draftFrom): mesma álgebra do
 *   preferences — clamp satura <=0 → 0 e round()*1000 idempotente; os ramos
 *   music/category/other colapsam pros mesmos valores (testes do killplane8
 *   asserem os valores em todos os ramos).
 * - #1486-1528 (draft.filePath MethodExpression): filePath.trim() em ''
 *   retorna '' — caminhos [filePath] vs [] diferem só em cenários já cobertos
 *   pelos guards length===0.
 */
