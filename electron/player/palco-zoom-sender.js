/**
 * Zoom das imagens e do PDF/PPT nas TVs do palco e transmissões por navegador.
 *
 * O quadro (imagem/página inteira) vai uma vez, pela barra. A cada mudança de
 * zoom vai só uma mensagem leve `frameView` (zoom + posição + animação), que o
 * receiver aplica sozinho: instantâneo e suave.
 *
 * Receivers antigos não entendem `frameView`: o servidor só a entrega a quem
 * avisou que entende. Para os antigos, quando o zoom para de mudar, sai o
 * quadro já recortado (`legacyOnly`), como antes.
 */
;(function () {
  var FRAME_VIEW_INTERVAL_MS = 33 // ~30 por segundo: fluido sem encher a rede
  var MIN_REMOTE_ANIM_MS = 90 // a rede chega em degraus: a TV liga um ao outro
  var LEGACY_SETTLE_MS = 450

  function viewKey(view) {
    return view ? (Number(view.zoom) || 1) + ':' + (Number(view.x) || 0) + ':' + (Number(view.y) || 0) : '1:0:0'
  }

  /**
   * @param {{
   *   send: (message: object, slotId: string) => Promise<unknown>,
   *   targets: () => string[],
   *   captureLegacy: () => Promise<string | null>,
   *   active: () => boolean,
   * }} options
   */
  function create(options) {
    var lastView = { zoom: 1, x: 0, y: 0 }
    var lastSentAt = 0
    var trailingTimer = 0
    var legacyTimer = 0
    var legacyKey = '1:0:0'
    var legacyBusy = false

    function sendToTargets(message) {
      var ids = options.targets()
      for (var i = 0; i < ids.length; i++) {
        try { void Promise.resolve(options.send(message, ids[i])).catch(function () {}) } catch (e) { /* TV saiu */ }
      }
    }

    function flushView() {
      trailingTimer = 0
      lastSentAt = Date.now()
      var anim = Math.max(MIN_REMOTE_ANIM_MS, Number(lastView.anim) || 0)
      sendToTargets({
        v: 2,
        type: 'frameView',
        view: { zoom: lastView.zoom, x: lastView.x, y: lastView.y, anim: anim },
      })
    }

    async function sendLegacy() {
      legacyTimer = 0
      if (!options.active()) return
      var key = viewKey(lastView)
      if (key === legacyKey) return
      if (legacyBusy) { scheduleLegacy(); return }
      legacyBusy = true
      try {
        var background = await options.captureLegacy()
        // o zoom mudou durante a captura: espera assentar de novo
        if (!background || !options.active() || viewKey(lastView) !== key) return
        sendToTargets({ v: 2, type: 'projection', frameSlide: true, background: background, text: '', footerRef: '', legacyOnly: true })
        legacyKey = key
      } finally {
        legacyBusy = false
      }
    }

    function scheduleLegacy() {
      clearTimeout(legacyTimer)
      legacyTimer = setTimeout(function () { void sendLegacy() }, LEGACY_SETTLE_MS)
    }

    return {
      /** Zoom novo (mouse no popup ou botões): repassa na hora. */
      onView: function (view) {
        if (!view || !options.active()) return
        lastView = { zoom: Number(view.zoom) || 1, x: Number(view.x) || 0, y: Number(view.y) || 0, anim: Number(view.anim) || 0 }
        var wait = FRAME_VIEW_INTERVAL_MS - (Date.now() - lastSentAt)
        if (wait <= 0 && !trailingTimer) flushView()
        else if (!trailingTimer) trailingTimer = setTimeout(flushView, Math.max(0, wait))
        scheduleLegacy()
      },
      /**
       * Quadro inteiro acabou de ir (página/imagem nova ou TV nova) com esta
       * visão: as TVs novas já estão certas; as antigas recebem o recorte se
       * houver zoom.
       */
      frameSent: function (view) {
        lastView = { zoom: Number(view && view.zoom) || 1, x: Number(view && view.x) || 0, y: Number(view && view.y) || 0, anim: 0 }
        legacyKey = '1:0:0'
        if (viewKey(lastView) !== legacyKey) scheduleLegacy()
      },
      stop: function () {
        clearTimeout(trailingTimer)
        clearTimeout(legacyTimer)
        trailingTimer = 0
        legacyTimer = 0
        legacyKey = '1:0:0'
      },
      viewKey: viewKey,
    }
  }

  window.PianoPalcoZoom = { create: create, viewKey: viewKey }
})()
