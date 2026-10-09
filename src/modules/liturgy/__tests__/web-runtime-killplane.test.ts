// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  LITURGY_WEB_RUNTIME_CHANNEL,
  LITURGY_WEB_RUNTIME_STORAGE_KEY,
  LITURGY_YT_SYNC_CHANNEL,
  DEFAULT_LITURGY_WEB_RUNTIME,
  normalizeLiturgyWebRuntime,
  parseLiturgyWebTarget,
  publishLiturgyWebRuntime,
  readLiturgyWebRuntimeFromStorage,
  clearLiturgyWebRuntime,
} from '../services/liturgy-web-runtime'

/**
 * Kill plane liturgy-web-runtime (survivors Stryker round 5).
 * Sem vi.mock — localStorage real (jsdom).
 */

beforeEach(() => {
  localStorage.clear()
})

describe('constantes de canal (#0/#1/#2)', () => {
  it('canais têm nomes exatos', () => {
    expect(LITURGY_WEB_RUNTIME_CHANNEL).toBe('louvorja-liturgy-web-runtime')
    expect(LITURGY_WEB_RUNTIME_STORAGE_KEY).toBe('louvorja-liturgy-web-runtime-state')
    expect(LITURGY_YT_SYNC_CHANNEL).toBe('louvorja-liturgy-yt-sync')
  })
})

describe('DEFAULT_LITURGY_WEB_RUNTIME (#5/#6/#7/#8)', () => {
  it('defaults exatos', () => {
    expect(DEFAULT_LITURGY_WEB_RUNTIME).toEqual({
      active: false,
      url: '',
      title: '',
      kind: 'site',
      videoId: '',
      startedAt: 0,
    })
  })
})

describe('parseLiturgyWebTarget (#18/#19/#31/#61/#64/#66/#70/#78/#88/#93/#94)', () => {
  it('host youtube variants (#31: 1º operando youtube.com)', () => {
    const t = parseLiturgyWebTarget('https://youtube.com/watch?v=ID123')
    expect(t?.kind).toBe('youtube')
    expect(t?.videoId).toBe('ID123')
    expect(t?.url).toBe('https://www.youtube.com/watch?v=ID123')
  })

  it('youtu.be path (#88: split pathname)', () => {
    const t = parseLiturgyWebTarget('https://youtu.be/abcXYZ9')
    expect(t?.kind).toBe('youtube')
    expect(t?.videoId).toBe('abcXYZ9')
  })

  it('vimeo numérico; vimeo não-numérico cai pra site (#93/#94)', () => {
    expect(parseLiturgyWebTarget('https://vimeo.com/123456789')).toEqual({
      kind: 'vimeo',
      videoId: '123456789',
      url: 'https://vimeo.com/123456789',
    })
    const t = parseLiturgyWebTarget('https://vimeo.com/abc')
    expect(t?.kind).toBe('site')
  })

  it('www. é removido do host (#70)', () => {
    const t = parseLiturgyWebTarget('https://www.youtube.com/watch?v=zz')
    expect(t?.kind).toBe('youtube')
  })

  it('site comum mantém url; sem protocolo prefixa https (#66)', () => {
    const t = parseLiturgyWebTarget('exemplo.com/pagina')
    expect(t).toEqual({ kind: 'site', videoId: '', url: 'https://exemplo.com/pagina' })
  })

  it('whitespace trimado; vazio -> null (#61/#64)', () => {
    expect(parseLiturgyWebTarget('   ')).toBeNull()
    expect(parseLiturgyWebTarget('')).toBeNull()
    expect(parseLiturgyWebTarget('  exemplo.com  ')?.url).toBe('https://exemplo.com')
  })
})

describe('normalizeLiturgyWebRuntime (#116/#130-135/#141)', () => {
  it('raw não-objeto retorna default (#116)', () => {
    for (const bad of [null, undefined, 42, 'x', true]) {
      expect(normalizeLiturgyWebRuntime(bad)).toEqual(DEFAULT_LITURGY_WEB_RUNTIME)
    }
  })

  it('kind só aceita youtube/vimeo/site; outros -> site (#130-135)', () => {
    expect(normalizeLiturgyWebRuntime({ kind: 'youtube', url: 'u' }).kind).toBe('youtube')
    expect(normalizeLiturgyWebRuntime({ kind: 'vimeo', url: 'u' }).kind).toBe('vimeo')
    expect(normalizeLiturgyWebRuntime({ kind: 'local-video', url: 'u' }).kind).toBe('site')
    expect(normalizeLiturgyWebRuntime({ kind: '', url: 'u' }).kind).toBe('site')
  })

  it('active só true se active===true E url não-vazia (#141)', () => {
    expect(normalizeLiturgyWebRuntime({ active: true, url: 'u' }).active).toBe(true)
    expect(normalizeLiturgyWebRuntime({ active: true, url: '  ' }).active).toBe(false)
    expect(normalizeLiturgyWebRuntime({ active: false, url: 'u' }).active).toBe(false)
    expect(normalizeLiturgyWebRuntime({ active: 1, url: 'u' }).active).toBe(false)
  })

  it('title/videoId trimados; startedAt não-número -> 0 (#18/#19 via startedAt)', () => {
    const r = normalizeLiturgyWebRuntime({
      title: '  T  ',
      videoId: '  v  ',
      startedAt: 1234,
      url: 'u',
      active: true,
    })
    expect(r.title).toBe('T')
    expect(r.videoId).toBe('v')
    expect(r.startedAt).toBe(1234)
    const r2 = normalizeLiturgyWebRuntime({ startedAt: 'x', url: 'u' })
    expect(r2.startedAt).toBe(0)
    const r3 = normalizeLiturgyWebRuntime({ startedAt: Infinity, url: 'u' })
    expect(r3.startedAt).toBe(0)
  })
})

describe('publish/read/clear round-trip (#153-159)', () => {
  it('publish grava em localStorage; read devolve; clear limpa', () => {
    const state = {
      active: true,
      url: 'https://x.com',
      title: 'T',
      kind: 'site' as const,
      videoId: '',
      startedAt: 5,
    }
    publishLiturgyWebRuntime(state)
    expect(localStorage.getItem(LITURGY_WEB_RUNTIME_STORAGE_KEY)).toBeTruthy()
    expect(readLiturgyWebRuntimeFromStorage()).toEqual(state)

    clearLiturgyWebRuntime()
    // clear publica o DEFAULT de volta (não remove a key)
    expect(readLiturgyWebRuntimeFromStorage()).toEqual(DEFAULT_LITURGY_WEB_RUNTIME)
  })

  it('storage corrompido -> default (#153/#158)', () => {
    localStorage.setItem(LITURGY_WEB_RUNTIME_STORAGE_KEY, '{quebrado')
    expect(readLiturgyWebRuntimeFromStorage()).toEqual(DEFAULT_LITURGY_WEB_RUNTIME)
  })

  it('storage vazio -> default', () => {
    expect(readLiturgyWebRuntimeFromStorage()).toEqual(DEFAULT_LITURGY_WEB_RUNTIME)
  })
})
