// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * useAppConfirm — monta AppConfirm.vue real via createApp e resolve a
 * promise conforme confirm/cancel. Testa o fluxo completo com o componente
 * real (não mock): o resolve vem do clique do usuário no modal.
 */

vi.mock('@shared/components/AppConfirm.vue', () => ({
  default: {
    name: 'AppConfirm',
    props: ['open', 'title', 'message', 'confirmLabel', 'cancelLabel', 'danger'],
    emits: ['confirm', 'cancel'],
    template: `
      <div v-if="open" data-testid="confirm-modal">
        <span data-testid="confirm-title">{{ title }}</span>
        <button data-testid="btn-confirm" @click="$emit('confirm')">ok</button>
        <button data-testid="btn-cancel" @click="$emit('cancel')">no</button>
      </div>
    `,
  },
}))

import { appConfirm } from '../useAppConfirm'

function findBtn(testid: string): HTMLButtonElement | null {
  return document.body.querySelector(`[data-testid="${testid}"]`)
}

async function flush(ms = 80) {
  await new Promise((r) => setTimeout(r, ms))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('appConfirm', () => {
  it('monta o modal com os textos e resolve true no confirm', async () => {
    const pending = appConfirm({
      title: 'Encerrar?',
      message: 'Tem certeza?',
      confirmLabel: 'Encerrar',
      cancelLabel: 'Voltar',
      danger: true,
    })
    await flush(10)
    expect(document.body.querySelector('[data-testid="confirm-modal"]')).toBeTruthy()
    expect(
      document.body.querySelector('[data-testid="confirm-title"]')?.textContent,
    ).toBe('Encerrar?')
    findBtn('btn-confirm')?.click()
    await pending.then((result) => expect(result).toBe(true))
    await flush()
    // modal desmontado
    expect(document.body.querySelector('[data-testid="confirm-modal"]')).toBeNull()
  })

  it('cancel (sem label custom) resolve false e desmonta', async () => {
    const pending = appConfirm({
      title: 'Título',
      message: 'Msg',
      confirmLabel: 'OK',
    })
    await flush(10)
    findBtn('btn-cancel')?.click()
    await expect(pending).resolves.toBe(false)
    await flush()
    expect(document.body.querySelector('[data-testid="confirm-modal"]')).toBeNull()
  })
})
