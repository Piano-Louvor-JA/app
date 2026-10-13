import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

import ptBR from '../locales/pt-BR'
import en from '../locales/en'
import es from '../locales/es'

describe('scheduled kind — resolução real do vue-i18n', () => {
  it('não vaza a chave para vídeo online nem arquivo local', () => {
    for (const [locale, messages] of Object.entries({ 'pt-BR': ptBR, en, es })) {
      const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } })
      for (const kind of ['file', 'online_video']) {
        const key = `liturgy.messages.scheduledKind.${kind}`
        expect(i18n.global.t(key)).not.toBe(key)
      }
    }
  })
})
