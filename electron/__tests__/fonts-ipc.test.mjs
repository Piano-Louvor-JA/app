// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { registerFontsIpc } from '../fonts/ipc.mjs'

describe('fonts IPC', () => {
  function setup() {
    const handlers = new Map()
    const service = { download: vi.fn(async id => ({ id })), preview: vi.fn(), list: vi.fn(async () => []), remove: vi.fn(), cleanup: vi.fn(), pin: vi.fn(), unpin: vi.fn() }
    registerFontsIpc({ handle: (name, handler) => handlers.set(name, handler) }, service, { trusted: e => e.sender.id === 1, catalog: [{ id: 'inter' }, { id: 'lora' }] })
    const sender = { id: 1, send: vi.fn(), isDestroyed: () => false, once: vi.fn(), removeListener: vi.fn() }
    return { handlers, service, event: { sender }, sender }
  }
  it('rejects untrusted senders', async () => {
    const { handlers } = setup()
    await expect(handlers.get('fonts:list-installed')({ sender: { id: 2 } })).rejects.toThrow('untrusted')
  })
  it('downloads a batch and emits progress tied to its job', async () => {
    const { handlers, service, event, sender } = setup()
    expect(await handlers.get('fonts:download-all')(event, { jobId: 'batch-1' })).toEqual({ failed: [] })
    expect(service.download).toHaveBeenCalledTimes(2)
    expect(sender.send).toHaveBeenLastCalledWith('fonts:progress', expect.objectContaining({ jobId: 'batch-1', done: 2, total: 2 }))
  })
  it('continues after a failed family and reports it', async () => {
    const { handlers, service, event } = setup()
    service.download.mockRejectedValueOnce(new Error('offline'))
    expect(await handlers.get('fonts:download-all')(event, { jobId: 'batch-2' })).toEqual({ failed: ['inter'] })
  })
  it('does not let another window cancel the owners job', async () => {
    const { handlers, service, event } = setup()
    let finish
    service.download.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const job = handlers.get('fonts:download')(event, { jobId: 'single', id: 'inter' })
    await Promise.resolve()
    expect(await handlers.get('fonts:cancel')({ sender: { ...event.sender, id: 3 } }, 'single').catch(() => false)).toBe(false)
    finish({ id: 'inter' })
    await job
  })
})
