/*
 * Transições de tela dos players (imagens, PDF e apresentação).
 * Mesmo catálogo de src/styles/screen-transitions.css, em Web Animations.
 *
 * A escolha fica no localStorage (origem file://, a mesma da barra de
 * controle e de todas as janelas do player): a barra grava, cada player lê
 * no momento da troca. Padrão: sem animação.
 *
 * Uso no player:
 *   const handle = PianoScreenTransition.begin(elemento) // antes de trocar
 *   ...troca o conteúdo do elemento...
 *   handle.play()                                       // depois de pronto
 */
;(function () {
  var STORAGE_KEY = 'piano.player.transition'
  var SPEED_MS = { fast: 150, normal: 250, slow: 450 }
  var BOUNCE = 'cubic-bezier(0.34, 1.56, 0.64, 1)'
  var WIPE = 'cubic-bezier(0.65, 0, 0.35, 1)'
  var P = 'perspective(1200px) '

  /** enter/leave = estado fora da tela; rest = estado normal (quando não é o padrão). */
  var CATALOG = {
    fade: { enter: { opacity: 0 }, leave: { opacity: 0 } },
    slide: { enter: { opacity: 0, transform: 'translateY(4vh)' }, leave: { opacity: 0, transform: 'translateY(-2vh)' } },
    'slide-down': { enter: { opacity: 0, transform: 'translateY(-4vh)' }, leave: { opacity: 0, transform: 'translateY(2vh)' } },
    'slide-left': { enter: { opacity: 0, transform: 'translateX(8vw)' }, leave: { opacity: 0, transform: 'translateX(-8vw)' } },
    'slide-right': { enter: { opacity: 0, transform: 'translateX(-8vw)' }, leave: { opacity: 0, transform: 'translateX(8vw)' } },
    zoom: { enter: { opacity: 0, transform: 'scale(0.94)' }, leave: { opacity: 0, transform: 'scale(1.03)' } },
    'zoom-out': { enter: { opacity: 0, transform: 'scale(1.12)' }, leave: { opacity: 0, transform: 'scale(0.9)' } },
    blur: { enter: { opacity: 0, filter: 'blur(14px)' }, leave: { opacity: 0, filter: 'blur(14px)' } },
    wipe: {
      enter: { clipPath: 'inset(0 100% 0 0)' },
      leave: { clipPath: 'inset(0 0 0 100%)' },
      rest: { clipPath: 'inset(0 0 0 0)' },
      easing: WIPE,
    },
    iris: {
      enter: { clipPath: 'circle(0% at 50% 50%)' },
      leave: { clipPath: 'circle(0% at 50% 50%)' },
      rest: { clipPath: 'circle(75% at 50% 50%)' },
    },
    curtain: {
      enter: { clipPath: 'inset(0 50% 0 50%)' },
      leave: { clipPath: 'inset(0 50% 0 50%)' },
      rest: { clipPath: 'inset(0 0 0 0)' },
    },
    flip: {
      enter: { opacity: 0, transform: P + 'rotateX(-75deg)' },
      leave: { opacity: 0, transform: P + 'rotateX(75deg)' },
      rest: { transform: P + 'rotateX(0deg)' },
    },
    drop: {
      enter: { opacity: 0, transform: 'translateY(-8vh)' },
      leave: { opacity: 0, transform: 'translateY(3vh)' },
      enterEasing: BOUNCE,
    },
    rotate: { enter: { opacity: 0, transform: 'rotate(-8deg) scale(0.9)' }, leave: { opacity: 0, transform: 'rotate(8deg) scale(0.9)' } },
    swing: {
      enter: { opacity: 0, transform: P + 'rotateY(-70deg)' },
      leave: { opacity: 0, transform: P + 'rotateY(70deg)' },
      rest: { transform: P + 'rotateY(0deg)' },
      origin: 'left center',
    },
    'flip-h': {
      enter: { opacity: 0, transform: P + 'rotateY(-80deg)' },
      leave: { opacity: 0, transform: P + 'rotateY(80deg)' },
      rest: { transform: P + 'rotateY(0deg)' },
    },
    pop: { enter: { opacity: 0, transform: 'scale(0.6)' }, leave: { opacity: 0, transform: 'scale(0.85)' }, enterEasing: BOUNCE },
    stretch: { enter: { opacity: 0, transform: 'scaleX(0.1)' }, leave: { opacity: 0, transform: 'scaleX(0.1)' } },
    cinema: {
      enter: { clipPath: 'inset(50% 0 50% 0)' },
      leave: { clipPath: 'inset(50% 0 50% 0)' },
      rest: { clipPath: 'inset(0 0 0 0)' },
    },
    'wipe-up': {
      enter: { clipPath: 'inset(100% 0 0 0)' },
      leave: { clipPath: 'inset(0 0 100% 0)' },
      rest: { clipPath: 'inset(0 0 0 0)' },
      easing: WIPE,
    },
    'wipe-down': {
      enter: { clipPath: 'inset(0 0 100% 0)' },
      leave: { clipPath: 'inset(100% 0 0 0)' },
      rest: { clipPath: 'inset(0 0 0 0)' },
      easing: WIPE,
    },
    diagonal: {
      enter: { clipPath: 'polygon(0 0, 0 0, 0 0)' },
      leave: { clipPath: 'polygon(0 0, 0 0, 0 0)' },
      rest: { clipPath: 'polygon(0 0, 200% 0, 0 200%)' },
      easing: WIPE,
    },
    glow: { enter: { opacity: 0, filter: 'brightness(3) blur(6px)' }, leave: { opacity: 0, filter: 'brightness(3) blur(6px)' } },
    float: {
      enter: { opacity: 0, filter: 'blur(6px)', transform: 'translateY(3vh)' },
      leave: { opacity: 0, filter: 'blur(6px)', transform: 'translateY(-3vh)' },
    },
    'zoom-blur': {
      enter: { opacity: 0, filter: 'blur(10px)', transform: 'scale(1.25)' },
      leave: { opacity: 0, filter: 'blur(10px)', transform: 'scale(0.8)' },
    },
  }

  /** Nomes na ordem do painel do app (barra de controle usa esta lista). */
  var OPTIONS = [
    ['fade', 'Esmaecer'],
    ['slide', 'Subir'],
    ['slide-down', 'Descer'],
    ['slide-left', 'Para a esquerda'],
    ['slide-right', 'Para a direita'],
    ['zoom', 'Aproximar'],
    ['zoom-out', 'Afastar'],
    ['blur', 'Desfocar'],
    ['wipe', 'Revelar'],
    ['iris', 'Círculo'],
    ['curtain', 'Cortina'],
    ['flip', 'Virar'],
    ['drop', 'Cair'],
    ['rotate', 'Girar'],
    ['swing', 'Balançar'],
    ['flip-h', 'Virar de lado'],
    ['pop', 'Saltar'],
    ['stretch', 'Esticar'],
    ['cinema', 'Cinema'],
    ['wipe-up', 'Revelar para cima'],
    ['wipe-down', 'Revelar para baixo'],
    ['diagonal', 'Diagonal'],
    ['glow', 'Clarão'],
    ['float', 'Flutuar'],
    ['zoom-blur', 'Zoom desfocado'],
  ]

  /**
   * { enabled, transition, speed }. `transition` guarda a última escolhida
   * mesmo com a animação desligada (religar volta nela).
   */
  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      var name = raw && typeof raw.transition === 'string' && CATALOG[raw.transition] ? raw.transition : 'fade'
      var speed = raw && SPEED_MS[raw.speed] ? raw.speed : 'normal'
      var enabled = raw && typeof raw.enabled === 'boolean'
        ? raw.enabled
        : Boolean(raw && CATALOG[raw.transition])
      return { enabled: enabled, transition: name, speed: speed }
    } catch (e) {
      return { enabled: false, transition: 'fade', speed: 'normal' }
    }
  }

  function save(next) {
    var current = read()
    var value = {
      enabled: next && typeof next.enabled === 'boolean' ? next.enabled : current.enabled,
      transition: next && CATALOG[next.transition] ? next.transition : current.transition,
      speed: next && SPEED_MS[next.speed] ? next.speed : current.speed,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch (e) {
      /* sem storage: fica sem animação */
    }
    return value
  }

  function reducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch (e) {
      return false
    }
  }

  function restFor(def, state) {
    var rest = {}
    Object.keys(state).forEach(function (key) {
      if (def.rest && key in def.rest) rest[key] = def.rest[key]
      else if (key === 'opacity') rest[key] = 1
      else rest[key] = 'none'
    })
    return rest
  }

  /** Cópia visual do conteúdo atual, fixa por cima da tela durante a saída. */
  function snapshot(el) {
    var rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    var ghost
    if (el.tagName === 'CANVAS') {
      ghost = document.createElement('canvas')
      ghost.width = el.width
      ghost.height = el.height
      var ctx = ghost.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(el, 0, 0)
    } else {
      ghost = el.cloneNode(true)
      ghost.removeAttribute('id')
      ghost.style.objectFit = getComputedStyle(el).objectFit
    }
    ghost.setAttribute('aria-hidden', 'true')
    ghost.style.position = 'fixed'
    ghost.style.left = rect.left + 'px'
    ghost.style.top = rect.top + 'px'
    ghost.style.width = rect.width + 'px'
    ghost.style.height = rect.height + 'px'
    ghost.style.margin = '0'
    ghost.style.transform = 'none'
    ghost.style.pointerEvents = 'none'
    ghost.style.zIndex = '5'
    document.body.appendChild(ghost)
    return ghost
  }

  var active = null

  function finishActive() {
    if (!active) return
    active.cancel()
    active = null
  }

  /**
   * Prepara a troca do conteúdo de `el`. Sem transição, `play()` não faz nada.
   * Saída do conteúdo antigo e depois entrada do novo (como o out-in do app).
   */
  function begin(el) {
    finishActive()
    var config = read()
    var def = config.enabled ? CATALOG[config.transition] : null
    if (!el || !def || reducedMotion()) return { play: function () {}, cancel: function () {} }

    var ms = SPEED_MS[config.speed]
    var ghost = snapshot(el)
    var animations = []
    var cancelled = false
    var origin = def.origin || 'center center'

    function cleanup() {
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost)
      ghost = null
      el.style.visibility = ''
    }

    var handle = {
      play: function () {
        if (cancelled) return
        el.style.visibility = 'hidden'
        var leave = Promise.resolve()
        if (ghost) {
          ghost.style.transformOrigin = origin
          var out = ghost.animate([restFor(def, def.leave), def.leave], {
            duration: ms,
            easing: def.easing || 'ease',
            fill: 'forwards',
          })
          animations.push(out)
          leave = out.finished.catch(function () {})
        }
        leave.then(function () {
          if (cancelled) return
          if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost)
          ghost = null
          el.style.visibility = ''
          var previousOrigin = el.style.transformOrigin
          if (def.origin) el.style.transformOrigin = origin
          var enter = el.animate([def.enter, restFor(def, def.enter)], {
            duration: ms,
            easing: def.enterEasing || def.easing || 'ease',
          })
          animations.push(enter)
          enter.finished
            .catch(function () {})
            .then(function () {
              if (def.origin) el.style.transformOrigin = previousOrigin
              if (active === handle) active = null
            })
        })
      },
      cancel: function () {
        cancelled = true
        animations.forEach(function (a) {
          try { a.cancel() } catch (e) { /* já terminou */ }
        })
        cleanup()
      },
    }
    active = handle
    return handle
  }

  /**
   * Prévia no painel: `el` sai, `swap()` troca o conteúdo e `el` entra.
   * Retorna uma Promise que resolve no fim.
   */
  function demo(el, name, speed, swap) {
    var def = CATALOG[name]
    var ms = SPEED_MS[speed] || SPEED_MS.normal
    if (!el || !def || reducedMotion()) {
      swap()
      return Promise.resolve()
    }
    el.style.transformOrigin = def.origin || 'center center'
    var out = el.animate([restFor(def, def.leave), def.leave], { duration: ms, easing: def.easing || 'ease', fill: 'forwards' })
    return out.finished.catch(function () {}).then(function () {
      swap()
      out.cancel()
      var enter = el.animate([def.enter, restFor(def, def.enter)], { duration: ms, easing: def.enterEasing || def.easing || 'ease' })
      return enter.finished.catch(function () {})
    })
  }

  window.PianoScreenTransition = {
    STORAGE_KEY: STORAGE_KEY,
    OPTIONS: OPTIONS,
    SPEED_MS: SPEED_MS,
    read: read,
    save: save,
    begin: begin,
    demo: demo,
  }
})()
