// Fila de downloads em background (Provai e Vede / Probad y Ved).
// - Processamento em SÉRIE (um arquivo por vez, não satura rede/dispositivo).
// - `.part` + HTTP Range: retoma de onde parou (app fechou no meio).
// - Fila persistida em download-queue.json: rehidrata no boot do app.
// - Rename atômico .part → final ao concluir (nunca arquivo parcial válido).
// - Eventos no webContents do renderer: download-progress, download-item-done,
//   download-item-failed, download-item-cancelled, download-batch-done.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { net } from 'electron'

const QUEUE_VERSION = 1

function sanitizeFileName(name) {
  const safe = path
    .basename(String(name || 'download.bin'))
    .replace(/[\\/:*?"<>|]/g, '_')
  if (!safe || safe === '.' || safe === '..') return null
  return safe
}

function loadQueue(queuePath) {
  try {
    if (!existsSync(queuePath)) return { version: QUEUE_VERSION, items: [] }
    const raw = readFileSync(queuePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== QUEUE_VERSION || !Array.isArray(parsed.items)) {
      // Fila corrompida / versão desconhecida: descarta e recomeça (risco mapeado no PLAN).
      return { version: QUEUE_VERSION, items: [] }
    }
    return parsed
  } catch {
    return { version: QUEUE_VERSION, items: [] }
  }
}

function saveQueue(queuePath, queue) {
  try {
    writeFileSync(queuePath, JSON.stringify(queue), { mode: 0o600 })
  } catch (error) {
    console.error('[download-batch] saveQueue', error)
  }
}

export function createDownloadBatch({ mediaDir, queuePath, sender, fetch, retries = 3 }) {
  const targetDir = path.join(mediaDir, 'provai-e-vede')
  const doFetch = fetch || ((url, init) => net.fetch(url, init))

  const queue = loadQueue(queuePath)
  let processing = false
  let cancelledIds = new Set()
  let idleWaiters = []
  const batchDoneSubscribers = []

  function ensureDir() {
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true, mode: 0o700 })
  }

  function emit(channel, payload) {
    try {
      if (sender && typeof sender.send === 'function' && (!sender.isDestroyed || !sender.isDestroyed())) sender.send(channel, payload)
    } catch {
      // janela fechada no meio do download: segue em background, sem crash
    }
  }

  function progress() {
    const total = queue.items.length
    const done = queue.items.filter(i => i.status === 'done').length
    const current = queue.items.find(i => i.status === 'active')
    emit('download-progress', {
      done,
      total,
      current: current
        ? {
            id: current.id,
            fileName: current.fileName,
            receivedBytes: current.receivedBytes || 0,
            totalBytes: current.totalBytes || 0,
          }
        : null,
    })
  }

  function persist() {
    saveQueue(queuePath, queue)
  }

  function notifyDone(item) {
    item.status = 'done'
    persist()
    emit('download-item-done', { id: item.id, fileName: item.fileName, filePath: item.filePath })
    progress()
  }

  function notifyFailed(item, reason) {
    item.status = 'failed'
    persist()
    emit('download-item-failed', { id: item.id, fileName: item.fileName, reason })
    progress()
  }

  async function processItem(item) {
    ensureDir()
    const safe = sanitizeFileName(item.fileName)
    if (!safe) {
      notifyFailed(item, 'invalid-file-name')
      return
    }
    const finalPath = path.join(targetDir, safe)
    if (!finalPath.startsWith(targetDir + path.sep)) {
      notifyFailed(item, 'invalid-path')
      return
    }
    item.filePath = finalPath

    // Arquivo final já existe: offline-first, não rebaixa.
    if (existsSync(finalPath)) {
      notifyDone(item)
      return
    }

    const partPath = `${finalPath}.part`
    let startByte = 0
    if (existsSync(partPath)) {
      try {
        startByte = statSync(partPath).size
      } catch {
        startByte = 0
      }
    }

    let lastError = null
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      if (cancelledIds.has(item.id)) {
        emit('download-item-cancelled', { id: item.id, fileName: item.fileName })
        progress()
        return
      }
      try {
        item.status = 'active'
        item.attempts = attempt
        progress()

        const headers = {}
        if (startByte > 0) headers.range = `bytes=${startByte}-`
        const response = await doFetch(item.url, { headers })
        if (!response.ok) throw new Error(`http-${response.status}`)

        // 206 = Range atendido: appenda no .part. 200 = servidor ignorou Range
        // (proxy/CDN sem suporte): fallback seguro — recomeça do zero (PLAN, riscos).
        const mode = startByte > 0 && response.status === 206 ? 'append' : 'truncate'
        if (mode === 'truncate') startByte = 0

        const buffer = Buffer.from(await response.arrayBuffer())
        if (cancelledIds.has(item.id)) {
          emit('download-item-cancelled', { id: item.id, fileName: item.fileName })
          progress()
          return
        }
        if (buffer.length > 0) {
          // Anti-TOCTOU (CodeQL js/file-system-race): zero existsSync no fluxo.
          // 'ax' = append exclusivo: falha com EEXIST se o .part não existir
          // (recria no retry) ou cria exclusive se existir outro writer.
          try {
            if (mode === 'append') {
              // Modo Range: .part é nosso (fila serial, um writer por item).
              appendFileSync(partPath, buffer, { flag: 'a', mode: 0o600 })
            } else {
              writeFileSync(partPath, buffer, { flag: 'wx', mode: 0o600 })
            }
          } catch (error) {
            if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error
            // wx falhou: .part renasceu entre o stat e o write (outra execução).
            // Fallback exclusivo-append retoma nele sem recriar (sem corrida).
            appendFileSync(partPath, buffer, { flag: 'a', mode: 0o600 })
          }
        } else {
          // chunk vazio: garante .part existente via 'a' sem checagem prévia
          // (cria se faltar, appenda 0 bytes se existir — sem corrida).
          try {
            appendFileSync(partPath, Buffer.alloc(0), { flag: 'a', mode: 0o600 })
          } catch {
            // .part sumiu entre rename e aqui: o próximo retry recria
          }
        }
        startByte += buffer.length
        item.receivedBytes = startByte

        renameSync(partPath, finalPath) // atômico no mesmo filesystem
        notifyDone(item)
        return
      } catch (error) {
        lastError = error
        // Mantém .part pro próximo retry/boot retomar com Range.
      }
    }
    notifyFailed(item, lastError ? String(lastError.message || lastError) : 'unknown')
  }

  async function drain() {
    if (processing) return
    processing = true
    try {
      for (;;) {
        const next = queue.items.find(i => i.status === 'pending')
        if (!next) break
        if (cancelledIds.has(next.id)) {
          next.status = 'cancelled'
          emit('download-item-cancelled', { id: next.id, fileName: next.fileName })
          continue
        }
        await processItem(next)
      }
    } finally {
      processing = false
      const allSettled = queue.items.every(i => i.status !== 'pending' && i.status !== 'active')
      const failed = queue.items.filter(i => i.status === 'failed').length
      const done = queue.items.filter(i => i.status === 'done').length
      if (allSettled && queue.items.length > 0) {
        emit('download-batch-done', { done, failed, total: queue.items.length })
      }
      const waiters = idleWaiters
      idleWaiters = []
      for (const resolve of waiters) resolve()
      if (queue.items.length > 0) {
        const summary = { done, failed, total: queue.items.length }
        for (const cb of batchDoneSubscribers) {
          try {
            cb(summary)
          } catch (error) {
            console.error('[download-batch] batch-done subscriber', error)
          }
        }
      }
    }
  }

  return {
    enqueue(items) {
      for (const it of items) {
        if (queue.items.some(existing => existing.id === it.id)) continue
        queue.items.push({
          id: String(it.id),
          url: String(it.url),
          fileName: String(it.fileName),
          status: 'pending',
          attempts: 0,
          receivedBytes: 0,
          totalBytes: Number(it.totalBytes) || 0,
        })
      }
      persist()
      progress()
      void drain()
    },
    cancel(id) {
      cancelledIds.add(String(id))
      const item = queue.items.find(i => i.id === String(id))
      if (item && (item.status === 'pending' || item.status === 'failed')) {
        item.status = 'cancelled'
        persist()
        emit('download-item-cancelled', { id: item.id, fileName: item.fileName })
        progress()
      }
    },
    retry(id) {
      const item = queue.items.find(i => i.id === String(id))
      if (item && item.status === 'failed') {
        item.status = 'pending'
        item.attempts = 0
        persist()
        void drain()
      }
    },
    resume() {
      let changed = false
      for (const item of queue.items) {
        if (item.status === 'active') {
          // App fechou no meio: volta pra pending; .part garante o Range.
          item.status = 'pending'
          changed = true
        }
      }
      if (changed) persist()
      void drain()
    },
    getPending() {
      return queue.items.filter(i => i.status === 'pending' || i.status === 'active')
    },
    waitIdle() {
      const hasWork = () => queue.items.some(i => i.status === 'pending' || i.status === 'active')
      if (!processing && !hasWork()) return Promise.resolve()
      return new Promise(resolve => {
        idleWaiters.push(() => {
          // drain só libera waiters quando tudo settle; dupla checagem por segurança.
          if (!hasWork()) resolve()
          else idleWaiters.push(resolve)
        })
      })
    },
    onBatchDone(cb) {
      if (typeof cb === 'function') batchDoneSubscribers.push(cb)
    },
  }
}
