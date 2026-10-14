/**
 * Testes da página do Pregador (/speaker) — speakerPageHtml() no palco-server.
 *
 * RF6: preview full-area (flex:1, min-height:0, 100dvh) — sem aspect-ratio fixo.
 * RF7/i18n: dicionário SPEAKER_I18N completo nos 3 idiomas; TODO texto visível
 * do template pt-BR vem do dicionário (data-i18n), nada hardcoded.
 * Tokens: cores/raios do CSS vêm interpoladas de SPEAKER_TOKENS (design system).
 */

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const serverUrl = pathToFileURL(path.resolve(process.cwd(), 'electron/palco-server.mjs')).href
const { speakerPageHtml, SPEAKER_I18N } = await import(serverUrl)

const html = speakerPageHtml()

describe('speakerPageHtml — RF6 preview full-area', () => {
  it('CSS usa layout flexível full-height (100dvh + flex:1 + min-height:0)', () => {
    expect(html).toContain('min-height:100dvh')
    expect(html).toContain('.preview{flex:1')
    expect(html).toContain('min-height:0')
    // RF6: aspect-ratio fixo (miniatura) REMOVIDO
    expect(html).not.toContain('aspect-ratio:16/9')
  })

  it('escala o iframe por largura E altura (sem estourar o box)', () => {
    expect(html).toContain('Math.min(box.clientWidth/1280,box.clientHeight/720)')
  })

  it('controles ficam no rodapé, depois do preview', () => {
    const previewIdx = html.indexOf('class="preview"')
    const footerIdx = html.indexOf('<footer>')
    const navIdx = html.indexOf('slide:prev')
    expect(previewIdx).toBeGreaterThan(-1)
    expect(footerIdx).toBeGreaterThan(previewIdx)
    expect(navIdx).toBeGreaterThan(footerIdx)
  })
})

describe('SPEAKER_I18N — RF7 i18n completo', () => {
  it('tem exatamente pt-BR, en, es', () => {
    expect(Object.keys(SPEAKER_I18N).sort()).toEqual(['en', 'es', 'pt-BR'])
  })

  it('todos os idiomas têm as mesmas chaves', () => {
    const base = Object.keys(SPEAKER_I18N['pt-BR']).sort()
    for (const lang of ['en', 'es']) {
      expect(Object.keys(SPEAKER_I18N[lang]).sort()).toEqual(base)
    }
  })

  it('todo data-i18n do template existe no dicionário', () => {
    const used = [...html.matchAll(/data-i18n(?:-attr)?="[^:"]*(?::([a-zA-Z]+))?"/g)]
      .map((m) => m[1] ?? m[0].split('"')[1])
    expect(used.length).toBeGreaterThan(0)
    for (const key of used) {
      expect(SPEAKER_I18N['pt-BR'][key]).toBeTruthy()
    }
  })
})

describe('speakerPageHtml — design tokens (RF-tokens)', () => {
  it('cores do CSS vêm dos tokens do design system', () => {
    expect(html).toContain('--bg:#131313')
    expect(html).toContain('--primary:#2196f3')
    expect(html).toContain('--radius-sm:8px 0 8px 0')
  })

  it('não usa cores hardcoded antigas (#111/#2867d8/#333)', () => {
    expect(html).not.toContain('#111')
    expect(html).not.toContain('#2867d8')
    expect(html).not.toContain('background:#333')
  })

  it('runtime troca idioma via ?lang= (pickLang no script)', () => {
    expect(html).toContain('pickLang')
    expect(html).toContain("q.get('lang')")
    expect(html).toContain('navigator.language')
  })
})
