/**
 * Store de itens agendados (calendário) — port do LouvorJA Delphi.
 * Fonte: itensAgendados.xml + itensAgendadosCategorias.xml (DATAPACKET).
 */
import { defineStore } from 'pinia'

import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { getUserPreference, setUserPreference } from '@shared/services/user-preferences'

import { parseDataPacket, type DataPacketRow } from '../services/datapacket-parser'
import type { LiturgyMusicMode } from '../types/liturgy'

export interface ScheduledCategory {
  id: string
  name: string
}

export interface ScheduledItemContent {
  kind: 'music' | 'file' | 'verse' | 'annotation' | 'online_video'
  /** kind=music */
  musicId?: number
  musicMode?: LiturgyMusicMode
  /** kind=file */
  filePath?: string
  /** kind=verse */
  verseBookId?: number
  verseChapter?: number
  verseNumbers?: string
  /** kind=annotation */
  text?: string
  /** kind=online_video */
  url?: string
  name?: string
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
  /**
   * Conteúdo polimórfico (qualquer tipo de item da liturgia pode ser agendado —
   * Rafael 07/10: "a programação toda com itens agendados"). Ausente = item
   * legado do port Delphi: o conteúdo é o próprio filePath (arquivo).
   */
  content?: ScheduledItemContent
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
    /** Categoria da rotação (upsert por id) — placeholder da liturgia aponta pra cá. */
    upsertCategory(cat: { id: string; name: string }) {
      const i = this.categories.findIndex((c) => c.id === cat.id)
      if (i >= 0) this.categories[i] = { ...this.categories[i], ...cat }
      else this.categories.push({ ...cat })
      this.persist()
    },

    /** Entrada agendada (upsert por id): data + conteúdo de QUALQUER tipo. */
    upsertItem(
      item: {
        id: string
        categoryId: string
        date: string
        name: string
        content?: ScheduledItemContent
        filePath?: string
      },
    ) {
      const normalized: ScheduledItem = {
        id: item.id,
        categoryId: item.categoryId,
        date: item.date,
        name: item.name,
        filePath: item.filePath ?? item.content?.filePath ?? '',
        isRelativePath: false,
        notes: '',
        ...(item.content ? { content: item.content } : {}),
      }
      const i = this.items.findIndex((x) => x.id === item.id)
      if (i >= 0) this.items[i] = normalized
      else this.items.push(normalized)
      this.persist()
    },

    /** A entrada da categoria para a data (o dia D resolve contra ela). */
    findOn(categoryId: string, isoDate: string): ScheduledItem | undefined {
      return this.items.find((i) => i.categoryId === categoryId && i.date === isoDate)
    },

    persist() {
      setUserPreference(USER_PREFERENCE_KEYS.scheduledState, {
        categories: this.categories,
        items: this.items,
      })
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
