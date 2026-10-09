/**
 * Store de itens agendados (calendário) — port do LouvorJA Delphi.
 * Fonte: itensAgendados.xml + itensAgendadosCategorias.xml (DATAPACKET).
 */
import { defineStore } from 'pinia'

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

import {
  enqueueOperatorState,
  scheduleOutboxFlush,
} from '@modules/sync/services/sync-outbox-service'
import { parseDataPacket, type DataPacketRow } from '../services/datapacket-parser'

export interface ScheduledCategory {
  id: string
  name: string
}

export interface ScheduledItem {
  id: string
  categoryId: string
  /** ISO yyyy-mm-dd */
  date: string
  name: string
  filePath: string
  /** Delphi ARQUIVO_INFO === 'I' (caminho relativo ao exe). */
  isRelativePath: boolean
  /** Extensão NOSSA — o Delphi não tem o campo. */
  notes: string
}

interface State {
  categories: ScheduledCategory[]
  items: ScheduledItem[]
}

function loadState(): State {
  const saved = getUserPreference<Partial<State>>(
    USER_PREFERENCE_KEYS.scheduledState,
    { categories: [], items: [] },
  )
  return {
    categories: saved?.categories ?? [],
    items: saved?.items ?? [],
  }
}

function parseDelphiDate(v: string): string | null {
  if (!v) return null
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(v)
  if (iso) return iso[1]!
  // TDateTime float: dias desde 30/12/1899 (serialização do ClientDataset)
  const days = Number.parseFloat(v)
  if (Number.isFinite(days) && days > 0 && days < 3_000_000) {
    const ms = Math.round(days * 86400000)
    const d = new Date(Date.UTC(1899, 11, 30) + ms)
    return d.toISOString().slice(0, 10)
  }
  return null
}

export const useScheduledStore = defineStore('scheduled', {
  state: (): State => loadState(),

  getters: {
    /** Itens de uma data ISO (yyyy-mm-dd), qualquer categoria. */
    itemsOn: (state) => (isoDate: string) =>
      state.items.filter((i) => i.date === isoDate),

    categoryName: (state) => (categoryId: string) =>
      state.categories.find((c) => c.id === categoryId)?.name ?? null,
  },

  actions: {
    persist() {
      const state = {
        categories: this.categories,
        items: this.items,
      }
      setUserPreference(USER_PREFERENCE_KEYS.scheduledState, state)
      // sync v2 (app#349): toda mutação enfileira no outbox (local-first) e
      // agenda flush em bg — sem rede o item fica na fila (nada se perde).
      try {
        enqueueOperatorState('scheduled', 'items', state)
        scheduleOutboxFlush()
      } catch {
        // outbox nunca bloqueia o fluxo local
      }
    },

    /** Importa DATAPACKETs já em texto XML. Retorna nº de itens importados. */
    importFromDelphi(categoriesXml: string, itemsXml: string | null): number {
      const catRows = parseDataPacket(categoriesXml)
      const itemRows = itemsXml ? parseDataPacket(itemsXml) : []

      const catIds = new Set(this.categories.map((c) => c.id))
      for (const row of catRows) {
        const id = row.ID ?? ''
        if (!id || catIds.has(id)) continue
        this.categories.push({ id, name: row.NOME ?? '' })
        catIds.add(id)
      }

      const byId = new Map(this.items.map((i) => [i.id, i]))
      let changed = 0
      for (const row of itemRows) {
        const id = row.ID ?? ''
        if (!id) continue
        const date = parseDelphiDate(row.DATA ?? '')
        if (!date) continue
        byId.set(id, {
          id,
          categoryId: row.CATEGORIA ?? '',
          date,
          name: row.NOME ?? '',
          filePath: row.ARQUIVO ?? '',
          isRelativePath: (row.ARQUIVO_INFO ?? '') === 'I',
          notes: '',
        })
        changed++
      }
      this.items = [...byId.values()]
      this.persist()
      return changed
    },
  },
})
