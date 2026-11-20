// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  normalizeLiturgyWebRuntime,
  parseLiturgyWebTarget,
  publishLiturgyWebRuntime,
} from '../services/liturgy-web-runtime'

/**
 * Kill plane 6 liturgy-web-runtime (survivors Stryker global 19/09):
 * #2412 asNumber cond→true, #2424 host youtube.com→true, #2459 regex
 * protocolo sem ^, #2463 www sem ^, #2471 vimeo→true, #2481 pop removido,
 * #2486/2487 âncoras do \d+, #2509/#2546 !raw→false, #2526 kind ternário,
 * #2551/#2552 removeItem da chave legada.
 * Sem vi.mock — localStorage real (jsdom).
 */

beforeEach(() => {
  localStorage.clear()
})

describe('kill plane 6 — normalizeLiturgyWebRuntime', () => {
  it('#2412 startedAt não-numérico vira 0 (asNumber guarda tipo)', () => {
    const r = normalizeLiturgyWebRuntime({ startedAt: 'não-sou-número' })
    expect(r.startedAt).toBe(0)
    const r2 = normalizeLiturgyWebRuntime({ startedAt: Number.NaN })
    expect(r2.startedAt).toBe(0)
  })

  it('#2412b startedAt válido passa', () => {
    const r = normalizeLiturgyWebRuntime({ startedAt: 1234 })
    expect(r.startedAt).toBe(1234)
  })

  it('#2509 null/0/"" voltam o default (sem crash)', () => {
    expect(normalizeLiturgyWebRuntime(null).url).toBe('')
    expect(normalizeLiturgyWebRuntime(0).url).toBe('')
    expect(normalizeLiturgyWebRuntime('').url).toBe('')
  })

  it('#2526 kind válido é preservado; inválido vira site', () => {
    expect(normalizeLiturgyWebRuntime({ kind: 'youtube', url: 'x' }).kind).toBe('youtube')
    expect(normalizeLiturgyWebRuntime({ kind: 'vimeo', url: 'x' }).kind).toBe('vimeo')
    expect(normalizeLiturgyWebRuntime({ kind: 'site', url: 'x' }).kind).toBe('site')
    expect(normalizeLiturgyWebRuntime({ kind: 'outro', url: 'x' }).kind).toBe('site')
  })
})

describe('kill plane 6 — parseLiturgyWebTarget', () => {
  it('#2459 https:// colado no MEIO não vira protocolo (regex tem ^)', () => {
    // original: sem ^ falharia em detectar o protocolo embutido
    const r = parseLiturgyWebTarget('x https://a.com')
    // valor com espaço: new URL não parseia → null; e NUNCA vira youtube/site
    expect(r === null || r?.kind === 'site').toBe(true)
    if (r) expect(r.url.startsWith('https://x%20')).toBe(true)
  })

  it('#2463 www. só é removido como PREFIXO (sub.www.youtube.com não é youtube)', () => {
    const r = parseLiturgyWebTarget('https://sub.www.youtube.com/watch?v=abc')
    // original: host "sub.www.youtube.com" não é host conhecido → site
    expect(r?.kind).toBe('site')
  })

  it('#2471/2481 host qualquer com path numérico NÃO vira vimeo', () => {
    const r = parseLiturgyWebTarget('https://exemplo.com/123')
    expect(r?.kind).toBe('site')
  })

  it('#2486 id vimeo com sufixo não-dígito NÃO é vimeo (regex $)', () => {
    const r = parseLiturgyWebTarget('https://vimeo.com/123abc')
    expect(r?.kind).toBe('site')
  })

  it('#2487 id vimeo com prefixo não-dígito NÃO é vimeo (regex ^)', () => {
    const r = parseLiturgyWebTarget('https://vimeo.com/abc123')
    expect(r?.kind).toBe('site')
  })

  it('vimeo numérico puro continua vimeo (sanidade)', () => {
    const r = parseLiturgyWebTarget('https://vimeo.com/123456789')
    expect(r?.kind).toBe('vimeo')
    expect(r?.videoId).toBe('123456789')
  })

  it('#2424 URL vimeo com ?v= NÃO vira youtube (host youtube.com não é catch-all)', () => {
    const r = parseLiturgyWebTarget('https://vimeo.com/42?v=xyz')
    // original: extractYoutubeId(host vimeo) → null → fluxo vimeo numérico
    expect(r?.kind).toBe('vimeo')
    expect(r?.videoId).toBe('42')
  })

  it('#2457 string vazia → null (sanidade do guard)', () => {
    expect(parseLiturgyWebTarget('   ')).toBeNull()
    expect(parseLiturgyWebTarget('')).toBeNull()
  })
})

describe('kill plane 6 — publish remove chave legada', () => {
  it('#2551/#2552 remove EXATAMENTE a chave legada louvorja-liturgy-yt-leader', () => {
    localStorage.setItem('louvorja-liturgy-yt-leader', 'lixo')
    localStorage.setItem('outra-chave', 'fica')
    publishLiturgyWebRuntime({
      active: false,
      url: '',
      title: '',
      kind: 'site',
      videoId: '',
      startedAt: 0,
    })
    expect(localStorage.getItem('louvorja-liturgy-yt-leader')).toBeNull()
    expect(localStorage.getItem('outra-chave')).toBe('fica')
  })
})

describe('kill plane 6b — parseLiturgyWebTarget regex/host', () => {
  it('sub.www.youtube.com NÃO é youtube (só prefixo www é removido)', () => {
    // #76:42 /^www\./ → /www\./
    const t = parseLiturgyWebTarget('https://sub.www.youtube.com/watch?v=abc123')
    expect(t?.kind).toBe('site')
  })

  it('vimeo.com/123456 → kind vimeo, videoId string "123456"', () => {
    // #89:18 pop() → split('/') devolveria array → regex falha → site
    const t = parseLiturgyWebTarget('https://vimeo.com/123456')
    expect(t?.kind).toBe('vimeo')
    if (t?.kind === 'vimeo') expect(t.videoId).toBe('123456')
  })

  it('kind explícito youtube preservado; inválido cai em site', () => {
    // #127:53 ternário → false
    expect(normalizeLiturgyWebRuntime({ url: 'https://x.com', kind: 'youtube' }).kind).toBe('youtube')
    expect(normalizeLiturgyWebRuntime({ url: 'https://x.com', kind: 'lixo' }).kind).toBe('site')
  })
})

describe('kill plane 6c — kills finais', () => {
  it('#38 asNumber: string numérica NÃO vira número (typeof guarda)', () => {
    // mutante `true && Number.isFinite(value)`: isFinite('5') coage → retorna '5'
    expect(normalizeLiturgyWebRuntime({ startedAt: '5' }).startedAt).toBe(0)
    expect(normalizeLiturgyWebRuntime({ startedAt: '5' }).startedAt).not.toBe('5')
  })

  it('#89 vimeo com trailing slash: filter(Boolean) antes do pop', () => {
    // mutante remove .filter(Boolean): '/123/' → pop '' → site vs vimeo
    const t = parseLiturgyWebTarget('https://vimeo.com/123456/')
    expect(t?.kind).toBe('vimeo')
    if (t?.kind === 'vimeo') expect(t.videoId).toBe('123456')
  })
})

/*
 * EQUIVALENTES documentados (auditoria 19/09 — web-runtime 7/7 finais):
 * #38 L37 typeof→true: Number.isFinite NÃO coage — '5' já cai no fallback
 *   nos dois lados. Equivalente.
 * #71 L70 !value→false: parseLiturgyWebTarget('') → new URL('https://')
 *   throws → catch null, igual ao early-return. Equivalente.
 * #74 L74 ^https?://→https?://: valor com 'https://' no meio tem espaço →
 *   new URL throws nos DOIS lados. Equivalente.
 * #76 L76 ^www\.→www\.: 'sub.www.youtube.com' nunca vira 'youtube.com'
 *   (replace do meio → 'sub.youtube.com' ≠ hosts aceitos). Equivalente.
 * #119 L119 typeof→false: source não-objeto truthy (42) → property access
 *   em number retorna undefined SEM crash → defaults idênticos. Só
 *   null/undefined crasham e !raw pega ambos. Equivalente.
 * #127 L127 última cláusula ||→false: 'youtube'==='youtube' (1ª cláusula)
 *   já casa — só o default 'site' final depende das cláusulas. Equivalente.
 * #144 L144 !raw→false: readFromStorage com raw null → JSON.parse(null)
 *   = null (não throws) → normalize(null) → defaults. Equivalente.
 */
