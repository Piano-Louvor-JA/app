import { onBeforeUnmount, ref } from 'vue'

import type { OnlineVideoDownload, OnlineVideoItemStatus, OnlineVideoStatus } from '@shared/types/desktop-bridge'

const VIDEO_ID = /^[\w-]{11}$/

function onlineVideoApi() {
  const bridge = typeof window !== 'undefined' ? window.louvorja : undefined
  return bridge?.isElectron ? bridge.onlineVideo : undefined
}

/** Em andamento (fila, descoberta, download ou montagem). */
export function isDownloading(status: OnlineVideoItemStatus | undefined): boolean {
  return Boolean(status && ['queued', 'resolving', 'downloading', 'muxing'].includes(status.state))
}

/**
 * Downloads do módulo YouTube: estado de cada vídeo (com progresso ao vivo), pedir para baixar
 * e cancelar. Usa a mesma cópia local das Configurações → Mídia & Player.
 */
export function useYoutubeDownloads() {
  const api = onlineVideoApi()
  const statuses = ref<Record<string, OnlineVideoItemStatus>>({})
  const supported = ref(false)
  /** Aba "Baixados": vídeos das duas pastas, do uso mais recente ao mais antigo. */
  const downloaded = ref<OnlineVideoDownload[]>([])

  async function loadDownloaded() {
    if (!api?.list || !supported.value) return
    try {
      downloaded.value = await api.list()
    } catch {
      // lista só informativa: fica a última que deu certo
    }
  }

  function set(id: string, status: OnlineVideoItemStatus) {
    statuses.value = { ...statuses.value, [id]: status }
  }

  async function init() {
    if (!api?.download) return
    try {
      const st: OnlineVideoStatus = await api.status()
      supported.value = !st.hidden && st.available
    } catch {
      supported.value = false
    }
    await loadDownloaded()
  }

  /** Atualiza o estado dos vídeos que estão na tela. */
  async function refresh(ids: string[]) {
    if (!api || !supported.value) return
    const wanted = [...new Set(ids.filter((id) => VIDEO_ID.test(id)))]
    if (wanted.length === 0) return
    try {
      const result = await api.videoStatus(wanted)
      statuses.value = { ...statuses.value, ...result }
    } catch {
      // estado só informativo: sem ele, o botão mostra "Baixar"
    }
  }

  /** Um vídeo ou vários (Baixar todos da coletânea). */
  async function download(ids: string | string[]): Promise<boolean> {
    const list = (Array.isArray(ids) ? ids : [ids]).filter((id) => VIDEO_ID.test(id))
    if (!api?.download || list.length === 0) return false
    const mark = (status: OnlineVideoItemStatus) => {
      statuses.value = { ...statuses.value, ...Object.fromEntries(list.map((id) => [id, status])) }
    }
    mark({ state: 'queued' })
    try {
      const ok = await api.download(list)
      if (!ok) mark({ state: 'error' })
      return ok
    } catch {
      mark({ state: 'error' })
      return false
    }
  }

  /** Apaga a cópia baixada; false quando o vídeo está tocando agora. */
  async function remove(id: string): Promise<boolean> {
    if (!api?.remove) return false
    try {
      const ok = await api.remove(id)
      if (ok) {
        set(id, { state: 'none' })
        await loadDownloaded()
      }
      return ok
    } catch {
      return false
    }
  }

  /** Renomeia o arquivo baixado; devolve o nome novo ou null (tocando agora ou falha). */
  async function rename(id: string, name: string): Promise<string | null> {
    if (!api?.rename) return null
    try {
      const fileName = await api.rename(id, name)
      if (fileName) {
        set(id, { state: 'ready', fileName })
        await loadDownloaded()
      }
      return fileName ?? null
    } catch {
      return null
    }
  }

  async function cancel(id: string) {
    if (!api) return
    try {
      await api.cancel(id)
    } finally {
      await refresh([id])
    }
  }

  const stop = api?.onChanged?.(({ id, status }) => {
    set(id, status)
    if (status.state === 'ready' || status.state === 'none') void loadDownloaded()
  })
  onBeforeUnmount(() => stop?.())
  void init()

  return { statuses, supported, downloaded, init, refresh, loadDownloaded, download, remove, rename, cancel }
}
