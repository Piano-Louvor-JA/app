import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { DEFAULT_FONT_FAMILY } from '../data/font-catalog'
import { loadLocalFont } from '@shared/services/font-loader'
import { resolveFontId, subscribeFontPreferences } from '@shared/services/font-preferences'

/** Each renderer owns its FontFaceSet; this deliberately does not depend on Pinia. */
export function useProjectionFont(scope: MaybeRefOrGetter<string>) {
  const family = ref<string>()
  let generation = 0
  async function update() {
    const request = ++generation
    let id: string | null
    try { id = resolveFontId(toValue(scope)) } catch { id = null }
    if (!id) { family.value = undefined; return }
    try {
      const loaded = await loadLocalFont(id)
      if (request === generation) family.value = loaded
    } catch {
      if (request === generation) family.value = DEFAULT_FONT_FAMILY
    }
  }
  const unsubscribe = subscribeFontPreferences(() => { void update() })
  watch(() => toValue(scope), () => { void update() }, { immediate: true })
  onScopeDispose(() => { generation++; unsubscribe() })
  return computed(() => ({ fontFamily: family.value, '--projection-font-family': family.value, fontSynthesis: family.value ? 'none' : undefined }))
}
