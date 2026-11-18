/**
 * Duas pastas de vídeos baixados: a do sistema (dentro dos dados do app) e uma personalizada,
 * escolhida pelo operador. Downloads novos vão para a pasta ativa; tocar, manter e apagar
 * enxergam as duas, então um vídeo baixado em qualquer uma continua tocando offline.
 * Mesma interface do CacheStore, para o gerenciador não precisar saber que são duas.
 */
import path from 'node:path'

/** Subpasta criada dentro da pasta escolhida: a limpeza do cache nunca toca nos arquivos do operador. */
export const CUSTOM_SUBDIR = 'LouvorJA-PIANO-videos'

/** @param {string} chosen pasta escolhida pelo operador */
export function customVideosDir(chosen) {
  return path.join(chosen, CUSTOM_SUBDIR)
}

/** @typedef {import('./cache-store.mjs').CacheStore} CacheStore */

export class MultiCache {
  /** @param {{ system: CacheStore, custom?: CacheStore | null, active?: 'system' | 'custom' }} opts */
  constructor({ system, custom = null, active = 'system' }) {
    this.system = system
    this.custom = custom
    this.active = active
  }

  /** @returns {CacheStore[]} */
  get stores() {
    return this.custom ? [this.system, this.custom] : [this.system]
  }

  /** Pasta que recebe os downloads novos. */
  get activeStore() {
    return this.active === 'custom' && this.custom ? this.custom : this.system
  }

  get activeName() {
    return this.activeStore === this.custom ? 'custom' : 'system'
  }

  get dir() {
    return this.activeStore.dir
  }

  get limitBytes() {
    return this.activeStore.limitBytes
  }

  /** Pasta que já tem o vídeo (a ativa primeiro). */
  owner(id) {
    const active = this.activeStore
    if (active.has(id)) return active
    return this.stores.find((store) => store !== active && store.has(id)) ?? null
  }

  has(id) {
    return this.owner(id) !== null
  }

  get(id) {
    return this.owner(id)?.get(id) ?? null
  }

  async touch(id) {
    await this.owner(id)?.touch(id)
  }

  /** Caminho do vídeo: onde ele já está, ou onde vai ser gravado (pasta ativa). */
  videoPath(id) {
    return (this.owner(id) ?? this.activeStore).videoPath(id)
  }

  subtitlePath(id) {
    return (this.owner(id) ?? this.activeStore).subtitlePath(id)
  }

  streamDir(id) {
    return this.activeStore.streamDir(id)
  }

  /** Arquivo servido pelo protocolo (`<id>.mp4` / `<id>.vtt`), na pasta que tem o vídeo. */
  fileFor(name) {
    const id = String(name).replace(/\.(mp4|vtt)$/, '')
    return path.join((this.owner(id) ?? this.activeStore).dir, name)
  }

  add(id, meta) {
    return this.activeStore.add(id, meta)
  }

  async setKeep(ids) {
    for (const store of this.stores) await store.setKeep(ids)
  }

  protect(id) {
    for (const store of this.stores) store.protect(id)
  }

  unprotect(id) {
    for (const store of this.stores) store.unprotect(id)
  }

  /** O espaço máximo vale para cada pasta. */
  async setLimit(bytes) {
    for (const store of this.stores) await store.setLimit(bytes)
  }

  usage() {
    let bytes = 0
    let count = 0
    for (const store of this.stores) {
      const u = store.usage()
      bytes += u.bytes
      count += u.count
    }
    return { bytes, count, limitBytes: this.activeStore.limitBytes }
  }

  async enforceLimit() {
    const removed = []
    for (const store of this.stores) removed.push(...(await store.enforceLimit()))
    return removed
  }

  async remove(id) {
    for (const store of this.stores) await store.remove(id)
  }

  /** Vídeo em uso agora (tocando ou baixando) em alguma pasta. */
  isProtected(id) {
    return this.stores.some((store) => store.protected.has(id))
  }

  /** @param {'system' | 'custom'} [which] sem argumento: as duas */
  async clear(which) {
    for (const store of this.stores) {
      if (!which || (which === 'custom' ? store === this.custom : store === this.system)) await store.clear()
    }
    return this.usage()
  }

  save() {
    return Promise.all(this.stores.map((store) => store.save()))
  }

  /** Carrega as pastas; a personalizada inacessível (disco removido) sai sem derrubar a do sistema. */
  async load() {
    await this.system.load()
    if (this.custom) {
      try {
        await this.custom.load()
      } catch {
        this.custom = null
      }
    }
    return this.usage()
  }

  /** Troca a pasta personalizada (já carregada) ou remove com `null`. */
  setCustom(store) {
    this.custom = store
  }

  /** @param {'system' | 'custom'} which */
  setActive(which) {
    this.active = which === 'custom' ? 'custom' : 'system'
  }

  /** Tamanho e caminho de cada pasta, para a tela de configurações. */
  folders() {
    const info = (store) => ({ dir: store.dir, ...store.usage() })
    return { system: info(this.system), custom: this.custom ? info(this.custom) : null, active: this.activeName }
  }
}
