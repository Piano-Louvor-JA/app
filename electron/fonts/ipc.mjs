import { FONT_CATALOG } from './service.mjs'

export function registerFontsIpc(ipc, service, { trusted, catalog = FONT_CATALOG }) {
  const jobs = new Map()
  const check = event => { if (!trusted(event)) throw new Error('untrusted-font-sender') }
  const jobId = payload => {
    if (!payload || typeof payload.jobId !== 'string' || !/^[\w-]{1,100}$/.test(payload.jobId)) throw new Error('invalid-font-job')
    return payload.jobId
  }
  async function job(event, payload, task) {
    check(event)
    const key = `${event.sender.id}:${jobId(payload)}`
    if (jobs.has(key)) throw new Error('font-job-exists')
    if ([...jobs.keys()].filter(k => k.startsWith(`${event.sender.id}:`)).length >= 4) throw new Error('font-job-limit')
    const controller = new AbortController()
    jobs.set(key, controller)
    const destroyed = () => controller.abort()
    event.sender.once('destroyed', destroyed)
    try { return await task(controller.signal) } finally {
      jobs.delete(key)
      event.sender.removeListener('destroyed', destroyed)
    }
  }
  ipc.handle('fonts:list-installed', async event => { check(event); return service.list() })
  const reservations = new Map()
  ipc.handle('fonts:release', async (event, id) => {
    check(event)
    const key = `${event.sender.id}:${id}`
    const release = reservations.get(key)
    release?.()
    return Boolean(release)
  })
  ipc.handle('fonts:download', (event, payload) => job(event, payload, async signal => {
    const key = `${event.sender.id}:${payload.jobId}`
    if (reservations.has(key) || [...reservations.keys()].filter(k => k.startsWith(`${event.sender.id}:`)).length >= 4) throw new Error('font-job-limit')
    service.pin(payload.id, key)
    const release = () => {
      service.unpin(key)
      reservations.delete(key)
      event.sender.removeListener('destroyed', release)
    }
    reservations.set(key, release)
    event.sender.once('destroyed', release)
    try { return await service.download(payload.id, { signal }) } catch (error) { release(); throw error }
  }))
  ipc.handle('fonts:preview', (event, payload) => job(event, payload, signal => service.preview(payload.id, { signal })))
  ipc.handle('fonts:remove', async (event, id) => { check(event); await service.remove(id); return true })
  ipc.handle('fonts:cancel', async (event, id) => {
    check(event)
    const controller = jobs.get(`${event.sender.id}:${id}`)
    controller?.abort()
    return Boolean(controller)
  })
  ipc.handle('fonts:download-all', (event, payload) => job(event, payload, async signal => {
    const failed = []
    let done = 0
    for (const font of catalog) {
      signal.throwIfAborted()
      try { await service.download(font.id, { signal }) } catch (error) {
        signal.throwIfAborted()
        failed.push(font.id)
      }
      done++
      if (!event.sender.isDestroyed()) event.sender.send('fonts:progress', { jobId: payload.jobId, done, total: catalog.length, current: font.id, failed: [...failed] })
    }
    return { failed }
  }))
}
