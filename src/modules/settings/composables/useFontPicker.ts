import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { DEFAULT_FONT_FAMILY, findFont, FONT_CATALOG, type FontCategory } from '../data/font-catalog'
import { useFontStore } from '../stores/useFontStore'
import { loadLocalFont } from '@shared/services/font-loader'
import { loadFontPreferences, referencedFonts, subscribeFontPreferences } from '@shared/services/font-preferences'
import { appConfirm } from '@shared/composables/useAppConfirm'
import type { FontProgress } from '@shared/types/fonts'

export function useFontPicker(scope: string) {
  const store = useFontStore()
  const { t } = useI18n()
  const search = ref('')
  const category = ref<FontCategory | ''>('')
  const uiOnly = ref(scope === 'system')
  const page = ref(0)
  const currentChoice = () => scope === 'system' ? store.preferences.systemFamilyId : store.preferences.stageFamilyIds[scope] ?? null
  const selected = ref<string | null>(currentChoice())
  const projectionOnly = computed(() => Boolean(selected.value && findFont(selected.value)?.ui === false))
  const canApply = computed(() => scope !== 'system' || selected.value === null || Boolean(findFont(selected.value)?.ui))
  const error = ref('')
  const status = ref('')
  const busy = ref(false)
  const progress = ref<FontProgress | null>(null)
  const previews = ref<Record<string, string>>({})
  const previewUnavailable = ref<Record<string, boolean>>({})
  const previewFontId = computed(() => selected.value ?? (scope === 'system' ? null : scope === 'global' ? store.preferences.systemFamilyId : store.preferences.stageFamilyIds.global ?? store.preferences.systemFamilyId))
  const previewFamilyName = computed(() => findFont(previewFontId.value)?.family ?? 'Plus Jakarta Sans')
  const previewFamily = computed(() => (previewFontId.value && previews.value[previewFontId.value]) || DEFAULT_FONT_FAMILY)
  const previewFailed = computed(() => Boolean(previewFontId.value && previewUnavailable.value[previewFontId.value] && !previews.value[previewFontId.value]))
  const previewLoading = computed(() => Boolean(previewFontId.value && !previews.value[previewFontId.value] && !previewFailed.value))

  const filtered = computed(() => FONT_CATALOG.filter(font => (!category.value || font.category === category.value) && (!uiOnly.value || font.ui) && font.family.toLocaleLowerCase().includes(search.value.toLocaleLowerCase().trim())))
  const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 8)))
  const visible = computed(() => filtered.value.slice(page.value * 8, page.value * 8 + 8))
  const installedIds = computed(() => new Set(store.installed.map(font => font.id)))
  const inUse = ref(referencedFonts())
  let active = true
  let operation = 0
  let previewGeneration = 0
  let job: string | null = null
  const previewJobs = new Map<string, string>()
  const pendingPreviews = new Map<string, Promise<void>>()
  const newId = () => crypto.randomUUID()
  let unsubscribeProgress: (() => void) | undefined
  const unsubscribePrefs = subscribeFontPreferences(() => {
    store.preferences = loadFontPreferences()
    inUse.value = referencedFonts()
  })

  watch([search, category, uiOnly], () => { page.value = 0 })
  function loadPreview(fontId: string): Promise<void> {
    if (previews.value[fontId]) return Promise.resolve()
    const pending = pendingPreviews.get(fontId)
    if (pending) return pending
    const id = newId()
    previewJobs.set(id, fontId)
    const request = Promise.resolve().then(async () => {
      try {
        const manifest = store.installed.find(item => item.id === fontId) ?? await store.api().preview(fontId, id)
        const family = await loadLocalFont(fontId, manifest)
        if (active) { previews.value[fontId] = family; delete previewUnavailable.value[fontId] }
      } catch {
        if (active) previewUnavailable.value[fontId] = true
      } finally {
        previewJobs.delete(id)
        pendingPreviews.delete(fontId)
      }
    })
    pendingPreviews.set(fontId, request)
    return request
  }
  async function previewVisible() {
    const generation = ++previewGeneration
    for (const [id, fontId] of previewJobs) {
      if (fontId !== previewFontId.value && !visible.value.some(font => font.id === fontId)) void store.api().cancel(id).catch(() => {})
    }
    // The large preview is loaded first; browsing never applies the draft.
    if (previewFontId.value) await loadPreview(previewFontId.value)
    for (const font of visible.value) {
      if (!active || generation !== previewGeneration) return
      await loadPreview(font.id)
    }
  }
  watch(visible, () => { if (active) void previewVisible() })
  watch(previewFontId, id => {
    if (active && id) { delete previewUnavailable.value[id]; void loadPreview(id) }
  })

  async function run(task: (id: string, version: number) => Promise<void>) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    status.value = ''
    const version = ++operation
    const id = newId()
    job = id
    try { await task(id, version) } catch {
      if (active && version === operation) error.value = 'settings.fonts.error'
    } finally {
      try { await store.api().release(id) } catch { /* release is best effort after bridge shutdown */ }
      if (active) busy.value = false
      if (job === id) job = null
    }
  }
  async function apply() {
    if (!canApply.value) return
    const choice = selected.value
    await run(async (id, version) => {
      if (choice) await store.prepare(choice, id)
      if (!active || version !== operation) return
      store.commit(scope, choice)
      status.value = 'settings.fonts.applied'
    })
  }
  async function downloadAll() {
    progress.value = { jobId: '', done: 0, total: FONT_CATALOG.length, current: '', failed: [] }
    await run(async (id, version) => {
      const result = await store.api().downloadAll(id)
      await store.refresh()
      if (!active || version !== operation) return
      status.value = result.failed.length ? 'settings.fonts.partial' : 'settings.fonts.downloadedAll'
    })
  }
  async function cancel() {
    operation++
    status.value = 'settings.fonts.cancelled'
    if (job) { try { await store.api().cancel(job) } catch { /* operation already settled */ } }
  }
  async function remove(id: string) {
    await run(async () => {
      await store.remove(id)
      delete previews.value[id]
    })
  }
  async function restore() {
    store.restore(false)
    selected.value = null
    const stages = await appConfirm({ title: t('settings.fonts.restore'), message: t('settings.fonts.restoreStages'), confirmLabel: t('settings.fonts.yes'), cancelLabel: t('settings.fonts.no') })
    if (stages) store.restore(true)
    status.value = 'settings.fonts.restored'
  }
  onMounted(async () => {
    try {
      unsubscribeProgress = store.api().onProgress(value => { if (active && value.jobId === job) progress.value = value })
      await store.refresh()
      if (active) await previewVisible()
    } catch { if (active) error.value = 'settings.fonts.error' }
  })
  onScopeDispose(() => {
    active = false
    operation++
    previewGeneration++
    unsubscribePrefs()
    unsubscribeProgress?.()
    if (job) void store.api().cancel(job).catch(() => {})
    for (const id of previewJobs.keys()) void store.api().cancel(id).catch(() => {})
  })
  return { canApply, projectionOnly, previewFamilyName, previewFamily, previewLoading, previewFailed, search, category, uiOnly, selected, page, pages, visible, filtered, installedIds, inUse, previews, previewUnavailable, busy, error, status, progress, apply, downloadAll, cancel, remove, restore }
}
