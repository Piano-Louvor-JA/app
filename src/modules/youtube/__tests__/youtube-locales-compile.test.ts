import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'

import en from '../locales/en'
import es from '../locales/es'
import ptBR from '../locales/pt-BR'

/** Todas as chaves-folha ("youtube.channels.hint", …) de um objeto de mensagens. */
function keysOf(messages: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? keysOf(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

/**
 * Os testes da tela simulam o `t`; aqui as mensagens passam pelo compilador real do
 * vue-i18n. Um `@` solto (ex.: "youtube.com/@canal") é sintaxe de mensagem vinculada
 * e quebra a renderização da tela inteira — tem que ser escrito como {'@'}.
 */
describe.each([['pt-BR', ptBR], ['en', en], ['es', es]] as const)('mensagens do YouTube (%s) compilam', (locale, messages) => {
  it('nenhuma mensagem dá erro de compilação', () => {
    const errors: string[] = []
    const i18n = createI18n({
      legacy: false,
      locale,
      messages: { [locale]: messages },
      missingWarn: false,
      fallbackWarn: false,
      warnHtmlMessage: false,
    })
    for (const key of keysOf(messages as Record<string, unknown>)) {
      try {
        i18n.global.t(key, { n: 1, name: 'X', query: 'q', title: 'T', size: '1 MB', q: 'q' })
      } catch (error) {
        errors.push(`${key}: ${(error as Error).message.split('\n')[0]}`)
      }
    }
    expect(errors).toEqual([])
  })

  it('o @ do link do canal aparece no texto', () => {
    const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } })
    expect(i18n.global.t('youtube.channels.hint')).toContain('youtube.com/@')
    expect(i18n.global.t('youtube.channels.addInvalid')).toContain('youtube.com/@')
  })
})
