import { computed } from 'vue'

import { useRandomStore } from '../stores/useRandomStore'

export function useRandomFeature() {
  const store = useRandomStore()

  store.hydrate()

  return {
    config: computed(() => store.config),
    session: computed(() => store.session),
    runtime: computed(() => store.runtime),
    draftName: computed(() => store.draftName),
    isProjecting: computed(() => store.isProjecting),
    configOpen: computed(() => store.configOpen),
    rangeError: computed(() => store.rangeError),
    undrawn: computed(() => store.undrawn),
    canDraw: computed(() => store.canDraw),
    drawnReversed: computed(() => store.drawnReversed),
    audioPlaying: computed(() => store.audioPlaying),
    isDrawing: computed(() => store.runtime.isDrawing),
    currentDisplay: computed(() => store.runtime.currentDisplay),
    mode: computed(() => store.session.mode),
    available: computed(() => store.available),
    drawn: computed(() => store.drawn),
    setMode: store.setMode,
    setNumberMin: store.setNumberMin,
    setNumberMax: store.setNumberMax,
    setDraftName: store.setDraftName,
    addName: store.addName,
    removeAvailable: store.removeAvailable,
    clearAvailable: store.clearAvailable,
    removeDrawn: store.removeDrawn,
    clearHistory: store.clearHistory,
    resetAll: store.resetAll,
    importNamesFromText: store.importNamesFromText,
    generateNumberRange: store.generateNumberRange,
    startDraw: store.startDraw,
    setBgColor: store.setBgColor,
    setTextColor: store.setTextColor,
    setFontSizePc: store.setFontSizePc,
    setDrawnSizePc: store.setDrawnSizePc,
    setTextTransform: store.setTextTransform,
    setAnimationSpeed: store.setAnimationSpeed,
    resetDisplayToDefault: store.resetDisplayToDefault,
    useDefaultDrawAudio: store.useDefaultDrawAudio,
    useCustomDrawAudio: store.useCustomDrawAudio,
    chooseCustomDrawAudio: store.chooseCustomDrawAudio,
    removeCustomDrawAudio: store.removeCustomDrawAudio,
    togglePreviewDrawAudio: store.togglePreviewDrawAudio,
    setAudioVolume: store.setAudioVolume,
    toggleAudioMuted: store.toggleAudioMuted,
    openConfig: store.openConfig,
    closeConfig: store.closeConfig,
    toggleProjection: store.toggleProjection,
    syncProjection: store.syncProjection,
    clearProjection: store.clearProjection,
  }
}
