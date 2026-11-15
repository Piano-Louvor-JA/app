/**
 * Zoom e deslocamento dos players de imagem e PDF/PPT (Liturgia).
 *
 * - Roda do mouse aproxima/afasta no ponto do cursor.
 * - Com zoom, arrastar move o conteúdo; duplo clique volta ao inteiro.
 * - O deslocamento é guardado em fração da tela: projetor e popup do operador,
 *   com resoluções diferentes, mostram o mesmo recorte.
 * - Mudança feita aqui (mouse) avisa o main, que repete nas telas de projeção;
 *   o main ignora o aviso de qualquer janela que não seja o popup.
 */
;(function () {
  var MIN_ZOOM = 1
  var MAX_ZOOM = 5
  // Animação: a roda do mouse anda em "degraus"; a transição liga um degrau
  // ao outro. Arrastar é imediato (segue o dedo/mouse sem atraso).
  var WHEEL_ANIM_MS = 140
  var STEP_ANIM_MS = 180
  var MAX_ANIM_MS = 400

  /** Duração da animação pedida (0 = imediato), dentro de um limite seguro. */
  function animMs(value) {
    var n = Number(value)
    return Number.isFinite(n) && n > 0 ? Math.min(MAX_ANIM_MS, Math.round(n)) : 0
  }

  /** Limita zoom (1×–5×) e deslocamento (a borda não passa do centro). */
  function clampView(next) {
    var rawZoom = Number(next && next.zoom)
    var zoom = Number.isFinite(rawZoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rawZoom)) : 1
    var limit = (zoom - 1) / 2
    function pick(value) {
      var n = Number(value)
      return Number.isFinite(n) ? Math.min(limit, Math.max(-limit, n)) : 0
    }
    return {
      zoom: Math.round(zoom * 1000) / 1000,
      // "|| 0": sem -0 no estado
      x: Math.round(pick(next && next.x) * 10000) / 10000 || 0,
      y: Math.round(pick(next && next.y) * 10000) / 10000 || 0,
    }
  }

  /**
   * @param {{
   *   stage: HTMLElement,
   *   target: HTMLElement,
   *   enabled?: () => boolean,
   *   onChange?: (view: { zoom: number, x: number, y: number }) => void,
   * }} options
   */
  function create(options) {
    var stage = options.stage
    var target = options.target
    var enabled = options.enabled || function () { return true }
    var view = { zoom: 1, x: 0, y: 0 }

    function copy() {
      return { zoom: view.zoom, x: view.x, y: view.y }
    }

    function render(anim) {
      if (!target) return
      var rect = stage.getBoundingClientRect()
      var ms = animMs(anim)
      target.style.transition = ms ? 'transform ' + ms + 'ms cubic-bezier(0.2, 0.7, 0.3, 1)' : 'none'
      target.style.transformOrigin = 'center center'
      target.style.transform =
        view.zoom === 1 && view.x === 0 && view.y === 0
          ? ''
          : 'translate(' + view.x * rect.width + 'px, ' + view.y * rect.height + 'px) scale(' + view.zoom + ')'
      document.body.classList.toggle('is-zoomed', view.zoom > 1)
    }

    /** `next.anim`: ms de animação até a nova visão (0/ausente = imediato). */
    function setView(next) {
      var before = view
      view = clampView(next)
      render(next && next.anim)
      if (options.onChange && (before.zoom !== view.zoom || before.x !== view.x || before.y !== view.y)) {
        options.onChange(copy())
      }
      return copy()
    }

    // Um aviso por quadro de tela; leva a animação usada aqui para as telas
    // repetirem o mesmo movimento.
    var reportFrame = 0
    var reportAnim = 0
    function report(anim) {
      reportAnim = animMs(anim)
      if (reportFrame) return
      reportFrame = requestAnimationFrame(function () {
        reportFrame = 0
        var api = window.louvorja && window.louvorja.projection
        if (api && typeof api.reportImageView === 'function') {
          var out = copy()
          out.anim = reportAnim
          api.reportImageView(out)
        }
      })
    }

    /** Zoom mantendo fixo o ponto sob o cursor (cx/cy: fração a partir do centro). */
    function zoomAt(factor, cx, cy) {
      var nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor))
      var px = (cx - view.x) / view.zoom
      var py = (cy - view.y) / view.zoom
      setView({ zoom: nextZoom, x: cx - nextZoom * px, y: cy - nextZoom * py, anim: WHEEL_ANIM_MS })
      report(WHEEL_ANIM_MS)
    }

    function pointerFraction(event) {
      var rect = stage.getBoundingClientRect()
      return {
        cx: (event.clientX - rect.left) / rect.width - 0.5,
        cy: (event.clientY - rect.top) / rect.height - 0.5,
      }
    }

    stage.addEventListener('wheel', function (event) {
      if (!enabled()) return
      event.preventDefault()
      var p = pointerFraction(event)
      zoomAt(Math.exp(-event.deltaY * 0.0015), p.cx, p.cy)
    }, { passive: false })

    var pan = null
    stage.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || view.zoom <= 1) return
      pan = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: view.x, y: view.y }
      stage.setPointerCapture(event.pointerId)
      document.body.classList.add('is-panning')
    })
    stage.addEventListener('pointermove', function (event) {
      if (!pan || event.pointerId !== pan.id) return
      var rect = stage.getBoundingClientRect()
      setView({
        zoom: view.zoom,
        x: pan.x + (event.clientX - pan.startX) / rect.width,
        y: pan.y + (event.clientY - pan.startY) / rect.height,
      })
      report()
    })
    function endPan(event) {
      if (!pan || event.pointerId !== pan.id) return
      pan = null
      document.body.classList.remove('is-panning')
    }
    stage.addEventListener('pointerup', endPan)
    stage.addEventListener('pointercancel', endPan)
    stage.addEventListener('dblclick', function () {
      setView({ zoom: 1, x: 0, y: 0, anim: STEP_ANIM_MS })
      report(STEP_ANIM_MS)
    })

    return {
      getView: copy,
      setView: setView,
      /** Outro conteúdo (imagem/página) começa inteiro, sem avisar o main. */
      reset: function () { return setView({ zoom: 1, x: 0, y: 0 }) },
      /** Reposiciona após mudar o tamanho da tela. */
      render: render,
    }
  }

  /**
   * Parte do conteúdo que aparece na tela com este zoom, em px do conteúdo
   * (a partir do canto superior esquerdo). O conteúdo fica centralizado na tela.
   * Sem zoom: o conteúdo inteiro.
   */
  function visibleRegion(view, size) {
    var v = clampView(view)
    var cw = size.contentWidth
    var ch = size.contentHeight
    var tx = v.x * size.stageWidth
    var ty = v.y * size.stageHeight
    function edge(screenEdge, shift, half) {
      return Math.min(half, Math.max(-half, (screenEdge - shift) / v.zoom)) + half
    }
    return {
      left: edge(-size.stageWidth / 2, tx, cw / 2),
      right: edge(size.stageWidth / 2, tx, cw / 2),
      top: edge(-size.stageHeight / 2, ty, ch / 2),
      bottom: edge(size.stageHeight / 2, ty, ch / 2),
    }
  }

  window.PianoZoomPan = {
    create: create,
    clampView: clampView,
    visibleRegion: visibleRegion,
    animMs: animMs,
    MIN_ZOOM: MIN_ZOOM,
    MAX_ZOOM: MAX_ZOOM,
    WHEEL_ANIM_MS: WHEEL_ANIM_MS,
    STEP_ANIM_MS: STEP_ANIM_MS,
  }
})()
