import { describe, expect, it, vi, beforeEach } from 'vitest'

const notificationCtor = vi.fn()
const showSpy = vi.fn()

vi.mock('electron', () => ({
  Notification: class {
    constructor(opts) {
      notificationCtor(opts)
      this.show = showSpy
    }
  },
}))

// Import dinâmico pra usar o mock acima
const { notifyDownloadComplete, formatBatchMessage } = await import('../ipc/download-notify.mjs')

describe('download-notify (T2)', () => {
  beforeEach(() => {
    notificationCtor.mockClear()
    showSpy.mockClear()
  })

  it('formata mensagem com done/failed/total', () => {
    expect(formatBatchMessage({ done: 12, failed: 1, total: 13 })).toBe('12 concluídos, 1 falhou de 13')
    expect(formatBatchMessage({ done: 13, failed: 0, total: 13 })).toBe('13 de 13')
  })

  it('mostra Notification OS ao concluir batch', () => {
    notifyDownloadComplete({ done: 13, failed: 0, total: 13 }, 'pt-BR')
    expect(notificationCtor).toHaveBeenCalledTimes(1)
    const opts = notificationCtor.mock.calls[0][0]
    expect(opts.title).toBeTruthy()
    expect(opts.body).toContain('13')
    expect(showSpy).toHaveBeenCalledTimes(1)
  })

  it('body destaca falhas quando existem', () => {
    notifyDownloadComplete({ done: 12, failed: 1, total: 13 }, 'pt-BR')
    const opts = notificationCtor.mock.calls[0][0]
    expect(opts.body).toContain('1')
  })
})
