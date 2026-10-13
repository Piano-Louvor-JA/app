/**
 * Lógica do dialog "Itens Agendados" (rotações + colar trimestre + grade).
 * Toda a manipulação de dados vive aqui; o .vue só desenha.
 */
import { computed, ref } from 'vue'

import { useScheduledStore } from '../stores/useScheduledStore'
import type { ScheduledItemContent } from '../stores/useScheduledStore'
import { parseQuarterPaste } from '../services/quarter-paste-parser'

export interface QuarterPasteReport {
  created: number
  errors: string[]
  unmappedSlots: string[]
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function useScheduledDialog() {
  const store = useScheduledStore()

  const rotations = computed(() => store.categories)
  /** Slots colados ainda sem rotação definida (slotKey → entradas brutas). */
  const pendingSlots = ref<Map<string, Array<{ dateISO: string; entry: { musicId?: number; name: string; filePath?: string } }>>>(new Map())

  function entriesOf(categoryId: string) {
    return store.items.filter((i) => i.categoryId === categoryId)
  }

  /**
   * Rotação "Provai e Vede" criada sob demanda — modo form: o usuário só preenche
   * data + conteúdo; a rotação existe sem ele precisar saber o que é rotação.
   */
  function ensureDefaultRotation(): string {
    const existing = store.categories.find((c) => c.name === 'Provai e Vede')
    if (existing) return existing.id
    return createRotation('Provai e Vede')
  }

  /** Todas as entradas de todas as rotações, ordenadas por data (grade única do dialog). */
  const entriesByDate = computed(() =>
    store.items
      .map((item) => ({
        ...item,
        rotationName: store.categoryName(item.categoryId) ?? '—',
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  )

  function createRotation(name: string): string {
    const id = `rot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    store.upsertCategory({ id, name: name.trim() })
    return id
  }

  function renameRotation(id: string, name: string) {
    store.upsertCategory({ id, name: name.trim() })
  }

  function removeRotation(id: string) {
    store.deleteCategory(id)
  }

  function addEntry(
    categoryId: string,
    input: { dateISO: string; content: ScheduledItemContent; name: string },
  ) {
    store.upsertItem({
      id: `sch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      categoryId,
      date: input.dateISO,
      name: input.name,
      content: input.content,
    })
  }

  function removeEntry(entryId: string) {
    store.deleteItem(entryId)
  }

  function normalizeSlotKey(slotKey: string): string {
    return slotKey
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
  }

  /**
   * Cola a lista do trimestre. slotMapping: slotKey normalizado → categoryId.
   * Slots sem mapeamento ficam pendentes (nada é perdido silenciosamente).
   */
  function applyQuarterPaste(
    text: string,
    context: {
      year: number
      slotMapping: Record<string, string | undefined>
      /** Modo newbie: slot desconhecido cria rotação nova com o nome do slot. */
      autoCreateSlots?: boolean
    },
  ): QuarterPasteReport {
    const { groups, errors } = parseQuarterPaste(text, { year: context.year })
    const report: QuarterPasteReport = { created: 0, errors, unmappedSlots: [] }
    // Rotações auto-criadas nesta colagem (slotKey normalizado → id), pra não
    // criar duas vezes quando o mesmo slot aparece em várias semanas.
    const autoCreated = new Map<string, string>()

    for (const group of groups) {
      for (const entry of group.entries) {
        const key = normalizeSlotKey(entry.slotKey)
        let categoryId = context.slotMapping[key]
        if (!categoryId && context.autoCreateSlots) {
          const cached = autoCreated.get(key)
          if (cached) {
            categoryId = cached
          } else {
            // Nome legível: "inicial es" → "Inicial Es"
            const label = entry.slotKey
              .trim()
              .split(/\s+/)
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ')
            categoryId = createRotation(label)
            autoCreated.set(key, categoryId)
          }
        }
        if (!categoryId) {
          report.unmappedSlots.push(entry.slotKey)
          const pending = pendingSlots.value.get(key) ?? []
          pending.push({ dateISO: group.dateISO, entry })
          pendingSlots.value = new Map(pendingSlots.value).set(key, pending)
          continue
        }
        applyEntryToRotation(categoryId, group.dateISO, entry)
        report.created++
      }
    }
    return report
  }

  function applyEntryToRotation(
    categoryId: string,
    dateISO: string,
    entry: { musicId?: number; name: string; filePath?: string },
  ) {
    const raw = entry.filePath ?? entry.name
    // URL http(s) = vídeo online (YouTube/Vimeo/…); caminho/sem esquema = arquivo.
    const isUrl = /^https?:\/\//i.test(raw)
    const content: ScheduledItemContent = entry.musicId
      ? { kind: 'music', musicId: entry.musicId }
      : isUrl
        ? { kind: 'online_video', url: raw }
        : { kind: 'file', filePath: raw }
    store.upsertItem({
      id: `sch-${dateISO}-${categoryId}-${entry.musicId ?? Math.random().toString(36).slice(2, 6)}`,
      categoryId,
      date: dateISO,
      name: entry.name || entry.filePath || `#${entry.musicId ?? ''}`,
      content,
    })
  }

  const pendingCount = computed(() => {
    let total = 0
    for (const list of pendingSlots.value.values()) total += list.length
    return total
  })

  /** Define/aplica o mapeamento de um slot pendente → rotação. */
  function applySlotMapping(slotKey: string, categoryId: string) {
    const key = normalizeSlotKey(slotKey)
    const pending = pendingSlots.value.get(key)
    if (!pending) return
    for (const item of pending) {
      applyEntryToRotation(categoryId, item.dateISO, item.entry)
    }
    const next = new Map(pendingSlots.value)
    next.delete(key)
    pendingSlots.value = next
  }

  /** Duplicar trimestre: copia as entradas de uma data-base +N semanas pra frente. */
  function duplicateQuarter(
    categoryId: string,
    context: { fromDate: string; weeks: number },
  ): number {
    const source = store.items.filter(
      (i) => i.categoryId === categoryId && i.date >= context.fromDate,
    )
    const offsetDays = context.weeks * 7
    let created = 0
    for (const item of source) {
      const newDate = addDaysISO(item.date, offsetDays)
      const exists = store.items.some(
        (i) => i.categoryId === categoryId && i.date === newDate,
      )
      if (exists) continue
      store.upsertItem({
        id: `${item.id}-w${context.weeks}`,
        categoryId,
        date: newDate,
        name: item.name,
        content: item.content,
        filePath: item.filePath,
      })
      created++
    }
    return created
  }

  return {
    rotations,
    entriesOf,
    entriesByDate,
    ensureDefaultRotation,
    createRotation,
    renameRotation,
    removeRotation,
    addEntry,
    removeEntry,
    applyQuarterPaste,
    pendingSlots,
    pendingCount,
    applySlotMapping,
    duplicateQuarter,
  }
}
