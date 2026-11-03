import { detectObsBeforeProjection } from '@modules/settings/services/obs-detection'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  closeProjectionModule,
  hasSelectedExtendedProjectionTargets,
  isProjectionModuleOpen,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'
import { isPalcoTvOnlyRoute } from '../../settings/services/palco-routing'

import {
  buildNumberRange,
  mergeUniqueNames,
  parseNameListFromText,
  remainingCandidates,
  runDrawAnimation,
} from '../services/random-draw'
import {
  applyRandomAudioOutput,
  deleteRandomCustomAudio,
  ensureRandomDefaultAudioInstalled,
  isRandomDrawAudioPlaying,
  pickAndImportRandomAudio,
  playRandomDrawAudio,
  playRandomWinnerEffect,
  stopRandomDrawAudio,
  subscribeRandomAudioPlaying,
  toggleRandomDrawAudio,
} from '../services/random-audio'
import {
  loadRandomDisplayConfig,
  loadRandomSession,
  saveRandomDisplayConfig,
  saveRandomSession,
} from '../services/random-preferences'
import {
  publishRandomRuntime,
} from '../services/random-runtime'
import {
  DEFAULT_RANDOM_DISPLAY_CONFIG,
  DEFAULT_RANDOM_RUNTIME,
  RANDOM_FONT_SIZE_MAX,
  RANDOM_FONT_SIZE_MIN,
  activeModePool,
  emptyModePool,
  type RandomAnimationSpeed,
  type RandomAudioSource,
  type RandomDisplayConfig,
  type RandomDrawMode,
  type RandomModePool,
  type RandomRuntimeState,
  type RandomSessionState,
  type RandomTextTransform,
} from '../types/random'

function createDefaultSession(): RandomSessionState {
  return {
    mode: 'names',
    names: emptyModePool(),
    numbers: emptyModePool(),
    numberMin: 1,
    numberMax: 100,
  }
}

function patchActivePool(
  session: RandomSessionState,
  patch: Partial<RandomModePool>,
): RandomSessionState {
  if (session.mode === 'names') {
    return {
      ...session,
      names: { ...session.names, ...patch },
    }
  }

  return {
    ...session,
    numbers: { ...session.numbers, ...patch },
  }
}

export const useRandomStore = defineStore('random', () => {
  const config = ref<RandomDisplayConfig>({ ...DEFAULT_RANDOM_DISPLAY_CONFIG })
  const session = ref<RandomSessionState>(createDefaultSession())
  const runtime = ref<RandomRuntimeState>({ ...DEFAULT_RANDOM_RUNTIME })
  const draftName = ref('')
  const isProjecting = ref(false)
  // Rota individual do Palco não abre janela cabo; impede o watch de
  // encerrar a projeção em 400ms por não encontrar janela.
  const projectingTvsOnly = ref(false)
  /** Preview no operador (1 monitor / sem tela de projeção marcada). */
  const inAppPreview = ref(false)
  const configOpen = ref(false)
  const hydrated = ref(false)
  const rangeError = ref<'invalid' | 'tooLarge' | null>(null)
  const audioPlaying = ref(false)

  let projectionWatchTimer: ReturnType<typeof setInterval> | null = null
  let cancelAnimation: (() => void) | null = null
  let unsubscribeAudioPlaying: (() => void) | null = null

  const activePool = computed(() => activeModePool(session.value))

  const available = computed(() => activePool.value.available)
  const drawn = computed(() => activePool.value.drawn)

  const undrawn = computed(() =>
    remainingCandidates(available.value, drawn.value),
  )

  const canDraw = computed(
    () => undrawn.value.length > 0 && !runtime.value.isDrawing,
  )

  const drawnReversed = computed(() => [...drawn.value].reverse())

  /** Sessão “achatada” para as views (modo ativo). */
  const viewSession = computed(() => ({
    mode: session.value.mode,
    available: available.value,
    drawn: drawn.value,
    numberMin: session.value.numberMin,
    numberMax: session.value.numberMax,
  }))

  function stopProjectionWatch() {
    if (!projectionWatchTimer) return
    clearInterval(projectionWatchTimer)
    projectionWatchTimer = null
  }

  function startProjectionWatch() {
    stopProjectionWatch()
    projectionWatchTimer = setInterval(() => {
      if (projectingTvsOnly.value || inAppPreview.value) return
      if (!isProjectionModuleOpen('random')) {
        isProjecting.value = false
        stopProjectionWatch()
      }
    }, 400)
  }

  function syncRuntime() {
    // Sempre reenvia o histórico/modo ativos (a projeção só vê o runtime).
    runtime.value = {
      ...runtime.value,
      drawn: [...drawn.value],
      mode: session.value.mode,
    }
    publishRandomRuntime(runtime.value)
  }

  function persistSession() {
    saveRandomSession(session.value)
  }

  function persistConfig() {
    saveRandomDisplayConfig(config.value)
  }

  function syncAudioOutput() {
    applyRandomAudioOutput({
      volume: config.value.audioVolume,
      muted: config.value.audioMuted,
    })
  }

  function hydrate() {
    if (hydrated.value) return
    config.value = loadRandomDisplayConfig()
    session.value = loadRandomSession()
    const pool = activeModePool(session.value)
    runtime.value = {
      currentDisplay: pool.currentDisplay,
      isDrawing: false,
      // hydrate preserva a intenção de projeção (fix 27/08): reconstruir
      // sem a flag derrubava 'projecting' e a TV perdia o dono no boot
      projecting: runtime.value.projecting === true,
      drawn: [...pool.drawn],
      mode: session.value.mode,
    }
    syncRuntime()
    syncAudioOutput()
    unsubscribeAudioPlaying?.()
    unsubscribeAudioPlaying = subscribeRandomAudioPlaying((playing) => {
      audioPlaying.value = playing
    })
    isProjecting.value = isProjectionModuleOpen('random')
    if (isProjecting.value) startProjectionWatch()
    void ensureRandomDefaultAudioInstalled()
    hydrated.value = true
  }

  function setMode(mode: RandomDrawMode) {
    if (session.value.mode === mode) return
    cancelDrawAnimation()

    // Guarda o display do modo atual antes de trocar
    session.value = patchActivePool(session.value, {
      currentDisplay: runtime.value.currentDisplay,
    })

    session.value = {
      ...session.value,
      mode,
    }

    const nextPool = activeModePool(session.value)
    runtime.value = {
      currentDisplay: nextPool.currentDisplay,
      isDrawing: false,
      projecting: runtime.value.projecting,
      drawn: [...nextPool.drawn],
      mode: mode,
    }
    draftName.value = ''
    rangeError.value = null
    persistSession()
    syncRuntime()
  }

  function setNumberMin(value: number) {
    session.value = { ...session.value, numberMin: value }
  }

  function setNumberMax(value: number) {
    session.value = { ...session.value, numberMax: value }
  }

  function setDraftName(value: string) {
    draftName.value = value
  }

  function addName(raw?: string) {
    // NFC: acentos decompostos (colagem/Android) quebram uppercase na TV e
    // permitem duplicatas invisíveis (José NFC ≠ José NFD).
    const name = (raw ?? draftName.value).trim().normalize('NFC')
    if (!name) return false
    if (available.value.includes(name)) {
      draftName.value = ''
      return false
    }

    session.value = patchActivePool(session.value, {
      available: [...available.value, name],
    })
    draftName.value = ''
    persistSession()
    return true
  }

  function removeAvailable(index: number) {
    if (index < 0 || index >= available.value.length) return
    const next = [...available.value]
    next.splice(index, 1)
    session.value = patchActivePool(session.value, { available: next })
    persistSession()
  }

  function clearAvailable() {
    session.value = patchActivePool(session.value, { available: [] })
    persistSession()
  }

  function removeDrawn(index: number) {
    if (index < 0 || index >= drawn.value.length) return
    const next = [...drawn.value]
    next.splice(index, 1)
    session.value = patchActivePool(session.value, { drawn: next })
    persistSession()
    syncRuntime()
  }

  function clearHistory() {
    session.value = patchActivePool(session.value, {
      drawn: [],
      currentDisplay: '',
    })
    runtime.value = {
      ...runtime.value,
      currentDisplay: '',
      isDrawing: false,
      drawn: [],
    }
    persistSession()
    syncRuntime()
  }

  function resetAll() {
    cancelDrawAnimation()
    // Limpa os dois modos
    session.value = {
      ...session.value,
      names: emptyModePool(),
      numbers: emptyModePool(),
    }
    runtime.value = { ...DEFAULT_RANDOM_RUNTIME }
    draftName.value = ''
    rangeError.value = null
    persistSession()
    syncRuntime()
  }

  function importNamesFromText(text: string): number {
    const parsed = parseNameListFromText(text)
    const { next, addedCount } = mergeUniqueNames(available.value, parsed)
    if (addedCount > 0) {
      session.value = patchActivePool(session.value, { available: next })
      persistSession()
    }
    return addedCount
  }

  function generateNumberRange(): boolean {
    const result = buildNumberRange(session.value.numberMin, session.value.numberMax)
    if (!result.ok) {
      rangeError.value = result.reason
      return false
    }

    cancelDrawAnimation()
    rangeError.value = null
    session.value = patchActivePool(session.value, {
      available: result.values,
      drawn: [],
      currentDisplay: '',
    })
    runtime.value = { ...DEFAULT_RANDOM_RUNTIME }
    persistSession()
    syncRuntime()
    return true
  }

  function cancelDrawAnimation(options?: { stopAudio?: boolean }) {
    cancelAnimation?.()
    cancelAnimation = null
    if (options?.stopAudio !== false) {
      stopRandomDrawAudio()
    }
  }

  function startDraw() {
    const pool = undrawn.value
    if (pool.length === 0 || runtime.value.isDrawing) return

    // Não interrompe o áudio se já estiver tocando.
    cancelDrawAnimation({ stopAudio: false })
    syncAudioOutput()
    if (!isRandomDrawAudioPlaying()) {
      playRandomDrawAudio(config.value)
    }
    runtime.value = {
      ...runtime.value,
      isDrawing: true,
    }
    syncRuntime()

    cancelAnimation = runDrawAnimation(pool, config.value.animationSpeed, {
      onTick: (candidate) => {
        runtime.value = {
          // ...spread: sortear NUNCA derruba 'projecting' — objeto novo
          // sem a flag soltava o claim e a TV congelava no último frame
          // (bug real 27/08: número sorteado não aparecia na TV).
          ...runtime.value,
          currentDisplay: candidate,
          isDrawing: true,
        }
        syncRuntime()
      },
      onFinish: (winner) => {
        cancelAnimation = null
        // Áudio de fundo continua; efeito curto marca o vencedor.
        playRandomWinnerEffect()
        const nextDrawn = [...drawn.value, winner]
        session.value = patchActivePool(session.value, {
          drawn: nextDrawn,
          currentDisplay: winner,
        })
        runtime.value = {
          ...runtime.value,
          currentDisplay: winner,
          isDrawing: false,
          drawn: nextDrawn,
        }
        persistSession()
        syncRuntime()
      },
    })
  }

  function setBgColor(bgColor: string) {
    config.value = { ...config.value, bgColor }
    persistConfig()
  }

  function setTextColor(textColor: string) {
    config.value = { ...config.value, textColor }
    persistConfig()
  }

  function setFontSizePc(fontSizePc: number) {
    const next = Math.min(
      RANDOM_FONT_SIZE_MAX,
      Math.max(RANDOM_FONT_SIZE_MIN, Math.round(fontSizePc)),
    )
    config.value = { ...config.value, fontSizePc: next }
    persistConfig()
  }

  function setTextTransform(textTransform: RandomTextTransform) {
    config.value = { ...config.value, textTransform }
    persistConfig()
  }

  function setAnimationSpeed(animationSpeed: RandomAnimationSpeed) {
    config.value = { ...config.value, animationSpeed }
    persistConfig()
  }

  function resetDisplayToDefault() {
    config.value = {
      ...DEFAULT_RANDOM_DISPLAY_CONFIG,
      audioSource: config.value.audioSource,
      customAudioFiles: [...config.value.customAudioFiles],
      customAudioFile: config.value.customAudioFile,
      audioVolume: config.value.audioVolume,
      audioMuted: config.value.audioMuted,
    }
    persistConfig()
  }

  function setAudioSource(audioSource: RandomAudioSource) {
    config.value = { ...config.value, audioSource }
    persistConfig()
  }

  async function useDefaultDrawAudio() {
    await ensureRandomDefaultAudioInstalled()
    config.value = {
      ...config.value,
      audioSource: 'default',
    }
    persistConfig()
  }

  function useCustomDrawAudio(fileName?: string) {
    const target =
      typeof fileName === 'string' && fileName.length > 0
        ? fileName
        : config.value.customAudioFile
    if (!target || !config.value.customAudioFiles.includes(target)) return
    config.value = {
      ...config.value,
      audioSource: 'custom',
      customAudioFile: target,
    }
    persistConfig()
  }

  async function chooseCustomDrawAudio() {
    const result = await pickAndImportRandomAudio()
    if (!result.ok || !result.fileName) return false
    const nextFiles = config.value.customAudioFiles.includes(result.fileName)
      ? [...config.value.customAudioFiles]
      : [...config.value.customAudioFiles, result.fileName]
    config.value = {
      ...config.value,
      audioSource: 'custom',
      customAudioFiles: nextFiles,
      customAudioFile: result.fileName,
    }
    persistConfig()
    return true
  }

  async function removeCustomDrawAudio(fileName: string) {
    const result = await deleteRandomCustomAudio(fileName)
    if (!result.ok) return false

    const nextFiles = config.value.customAudioFiles.filter((name) => name !== fileName)
    const wasSelected = config.value.customAudioFile === fileName
    const nextSelected = wasSelected
      ? (nextFiles[0] ?? null)
      : config.value.customAudioFile && nextFiles.includes(config.value.customAudioFile)
        ? config.value.customAudioFile
        : (nextFiles[0] ?? null)

    config.value = {
      ...config.value,
      customAudioFiles: nextFiles,
      customAudioFile: nextSelected,
      audioSource:
        wasSelected && !nextSelected ? 'default' : config.value.audioSource,
    }
    persistConfig()
    return true
  }

  function togglePreviewDrawAudio() {
    syncAudioOutput()
    toggleRandomDrawAudio(config.value)
  }

  function setAudioVolume(audioVolume: number) {
    const next = Math.min(1, Math.max(0, audioVolume))
    config.value = { ...config.value, audioVolume: next }
    syncAudioOutput()
    persistConfig()
  }

  function setAudioMuted(audioMuted: boolean) {
    config.value = { ...config.value, audioMuted }
    syncAudioOutput()
    persistConfig()
  }

  function toggleAudioMuted() {
    setAudioMuted(!config.value.audioMuted)
  }

  function openConfig() {
    configOpen.value = true
  }

  function closeConfig() {
    configOpen.value = false
  }

  async function syncProjection() {
    await detectObsBeforeProjection()
    runtime.value = { ...runtime.value, projecting: true }
    syncRuntime()
    // Mesmo contrato da Bíblia: slot individual = só TV; Espelhar =
    // janela nos monitores selecionados + TVs Palco.
    if (isPalcoTvOnlyRoute('random')) {
      isProjecting.value = true
      projectingTvsOnly.value = true
      inAppPreview.value = false
      startProjectionWatch()
      return
    }
    projectingTvsOnly.value = false
    const hasExternal = await hasSelectedExtendedProjectionTargets()
    if (!hasExternal) {
      closeProjectionModule()
      isProjecting.value = true
      inAppPreview.value = true
      startProjectionWatch()
      return
    }
    inAppPreview.value = false
    const opened = await openProjectionModule('random')
    isProjecting.value = opened
    if (opened) startProjectionWatch()
    else stopProjectionWatch()
  }

  function clearProjection() {
    isProjecting.value = false
    projectingTvsOnly.value = false
    inAppPreview.value = false
    runtime.value = { ...runtime.value, projecting: false }
    stopProjectionWatch()
    closeProjectionModule()
    syncRuntime()
  }

  async function toggleProjection() {
    if (isProjecting.value && (isProjectionModuleOpen('random') || projectingTvsOnly.value || inAppPreview.value)) {
      clearProjection()
      return
    }
    await syncProjection()
  }

  return {
    config,
    session: viewSession,
    runtime,
    draftName,
    isProjecting,
    inAppPreview,
    configOpen,
    hydrated,
    rangeError,
    available,
    drawn,
    undrawn,
    canDraw,
    drawnReversed,
    audioPlaying,
    hydrate,
    setMode,
    setNumberMin,
    setNumberMax,
    setDraftName,
    addName,
    removeAvailable,
    clearAvailable,
    removeDrawn,
    clearHistory,
    resetAll,
    importNamesFromText,
    generateNumberRange,
    startDraw,
    cancelDrawAnimation,
    setBgColor,
    setTextColor,
    setFontSizePc,
    setTextTransform,
    setAnimationSpeed,
    resetDisplayToDefault,
    setAudioSource,
    useDefaultDrawAudio,
    useCustomDrawAudio,
    chooseCustomDrawAudio,
    removeCustomDrawAudio,
    togglePreviewDrawAudio,
    setAudioVolume,
    setAudioMuted,
    toggleAudioMuted,
    openConfig,
    closeConfig,
    toggleProjection,
    syncProjection,
    clearProjection,
  }
})
