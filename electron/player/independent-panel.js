/**
 * Projeção independente nos players do Piano (vídeo, imagens, texto, PDF,
 * apresentação, site) — mesmo recurso da Bíblia: botão ao lado de "Selecionar
 * telas" e painel com Sobrepor/Compartilhar, monitores e Conexões Remotas.
 *
 * Monitores e conexões são caixas de seleção (vários de uma vez). Marcar só escolhe o destino; a projeção começa
 * (e para) pela seta "Projetar" da barra, junto com a principal.
 * Monitores: o processo principal abre o player numa janela independente
 * (sempre acima, ou dividindo o monitor). Conexões Remotas: o player vai à
 * conexão escolhida pelo espelho de rede (sessão própria). Depende de
 * ../palco/network-mirror.js para as conexões.
 */
;(function () {
  var ICON = 'M21 3H3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h6v2H7v2h10v-2h-2v-2h3v-2H3V5h18v5h2V5c0-1.1-.9-2-2-2zm2 11h-7v8h7v-8zm-2 6h-3v-4h3v4z'
  var MODE_HINT = {
    overlay: 'Marque um ou mais monitores e clique na seta "Projetar". Este recurso aparece por cima do que estiver projetado neles; os outros monitores não mudam.',
    share: 'Marque um ou mais monitores e clique na seta "Projetar". Cada um fica dividido: metade com o que já está projetado e metade com este recurso.',
  }
  var REMOTE_SHARE_HINT = 'Nas conexões remotas o recurso ocupa a tela inteira.'
  var ENABLE_HINT = 'Ative em Telas para usar'

  var STYLE = [
    '.ip-btn{position:relative}',
    '.ip-btn.is-active{background:rgba(234,88,12,.28);color:#fb923c}',
    '.ip-btn.is-armed{box-shadow:inset 0 0 0 2px rgba(251,146,60,.85);color:#fb923c}',
    '.ip-live{margin-left:.35rem;padding:0 .35rem;border-radius:999px;background:#fb923c;color:#111827;font-size:.62rem;font-weight:800}',
    '.ip-project-live{background:rgba(234,88,12,.28)!important;color:#fb923c!important}',
    '.ip-panel{display:none;position:fixed;left:.5rem;bottom:3.6rem;width:min(22rem,calc(100% - 1rem));overflow:auto;',
    'padding:.7rem .75rem;border:1px solid rgba(232,237,245,.12);border-radius:.65rem;background:rgba(26,30,40,.97);box-shadow:0 14px 36px rgba(0,0,0,.45);',
    'color:#e8edf5;font:500 .82rem/1.35 system-ui,sans-serif;z-index:30}',
    '.ip-panel.is-open{display:block}',
    '.ip-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.45rem;font-weight:700;font-size:.85rem}',
    '.ip-identify{width:2rem!important;height:2rem!important}',
    '.ip-modes{display:grid;grid-template-columns:1fr 1fr;gap:.35rem;margin-bottom:.45rem}',
    '.ip-mode{width:auto!important;height:2.1rem!important;border-radius:.45rem!important;border:1px solid rgba(255,255,255,.16)!important;font-size:.78rem;font-weight:700;gap:.35rem}',
    '.ip-mode.is-selected{border-color:#fb923c!important;background:rgba(234,88,12,.22)!important;color:#fb923c}',
    '.ip-hint{margin:0 0 .5rem;font-size:.72rem;opacity:.7}',
    '.ip-list{display:flex;flex-direction:column;gap:.3rem}',
    '.ip-item{display:flex!important;align-items:center;justify-content:flex-start!important;gap:.65rem;width:100%!important;height:auto!important;padding:.4rem .65rem!important;',
    'border-radius:.55rem!important;border:1px solid rgba(255,255,255,.12)!important;text-align:left;background:rgba(255,255,255,.03)!important}',
    '.ip-item.is-active{border-color:#fb923c!important;background:rgba(234,88,12,.16)!important}',
    '.ip-check{position:relative;width:.95rem;height:.95rem;flex:none;border:2px solid currentColor;border-radius:.2rem;opacity:.8}',
    '.ip-item.is-active .ip-check{background:#fb923c;border-color:#fb923c;opacity:1}',
    '.ip-item.is-active .ip-check::after{content:"";position:absolute;left:.22rem;top:.04rem;width:.22rem;height:.45rem;border:solid #1a1e28;border-width:0 2px 2px 0;transform:rotate(45deg)}',
    '.ip-name{display:block;font-weight:700;font-size:.8rem}',
    '.ip-meta{display:block;font-size:.7rem;opacity:.6}',
    '.ip-section{margin:.6rem 0 .35rem;padding-top:.5rem;border-top:1px solid rgba(255,255,255,.1);color:#4ade80;font-weight:700;font-size:.78rem}',
    '.ip-empty{margin:0;font-size:.74rem;opacity:.6}',
    '.ip-item:disabled{opacity:.45;cursor:not-allowed}',
    '.ip-note{display:block;font-size:.68rem;color:#fbbf24}',
  ].join('')

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
  }

  function svg(path) {
    var ns = 'http://www.w3.org/2000/svg'
    var root = document.createElementNS(ns, 'svg')
    root.setAttribute('viewBox', '0 0 24 24')
    root.setAttribute('aria-hidden', 'true')
    var shape = document.createElementNS(ns, 'path')
    shape.setAttribute('d', path)
    root.appendChild(shape)
    return root
  }

  function api() {
    return window.louvorja || null
  }

  function mount(options) {
    var opts = options || {}
    // Áudio sozinho não tem tela para projetar.
    if (new URLSearchParams(window.location.search).get('audioOnly') === '1') return null
    var anchor = opts.anchor || document.querySelector('.monitor-wrap')
    if (!anchor || !anchor.parentNode || document.getElementById('independentProjection')) return null
    var bridge = api()
    if (!bridge || !bridge.projection || !bridge.projection.openIndependent) return null

    var style = el('style')
    style.textContent = STYLE
    document.head.appendChild(style)

    var button = el('button', 'ip-btn')
    button.id = 'independentProjection'
    button.type = 'button'
    button.title = 'Projeção independente'
    button.setAttribute('aria-label', 'Projeção independente')
    button.setAttribute('aria-haspopup', 'dialog')
    button.setAttribute('aria-expanded', 'false')
    button.appendChild(svg(ICON))
    anchor.parentNode.insertBefore(button, anchor.nextSibling)

    var panel = el('div', 'ip-panel')
    panel.id = 'independentPanel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', 'Projeção independente')
    var head = el('div', 'ip-head')
    head.appendChild(el('span', '', 'Projeção independente'))
    var identify = el('button', 'ip-identify')
    identify.type = 'button'
    identify.title = 'Identificar monitores'
    identify.setAttribute('aria-label', 'Identificar monitores')
    identify.appendChild(svg('M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2zM12 8a4 4 0 100 8 4 4 0 000-8z'))
    head.appendChild(identify)
    panel.appendChild(head)

    var modes = el('div', 'ip-modes')
    modes.setAttribute('role', 'radiogroup')
    modes.setAttribute('aria-label', 'Modo')
    var modeButtons = {}
    ;[['overlay', 'Sobrepor'], ['share', 'Compartilhar']].forEach(function (pair) {
      var b = el('button', 'ip-mode', pair[1])
      b.type = 'button'
      b.setAttribute('role', 'radio')
      b.dataset.mode = pair[0]
      modeButtons[pair[0]] = b
      modes.appendChild(b)
    })
    panel.appendChild(modes)
    var hint = el('p', 'ip-hint')
    panel.appendChild(hint)
    var monitorList = el('div', 'ip-list')
    monitorList.id = 'independentMonitors'
    panel.appendChild(monitorList)
    var remoteTitle = el('p', 'ip-section', 'Conexões Remotas')
    panel.appendChild(remoteTitle)
    var remoteHint = el('p', 'ip-hint', REMOTE_SHARE_HINT)
    panel.appendChild(remoteHint)
    var remoteList = el('div', 'ip-list')
    remoteList.id = 'independentRemotes'
    panel.appendChild(remoteList)
    document.body.appendChild(panel)

    var mode = 'overlay'
    var open = false
    var displays = []
    var enabledIds = null // monitores ativos no "Telas" (null = não informado: todos)
    var slots = []
    var active = null // { displayIds, mode } do main
    var selDisplays = [] // monitores marcados (projetam pela seta)
    var selRemotes = [] // conexões marcadas (projetam pela seta)
    var remoteLive = [] // conexões no ar agora
    var sender = null
    var busy = false
    var projectBtn = document.getElementById('project') || document.getElementById('projectScreens')

    var bar = document.querySelector('.bar')
    var barStyle = null
    var barHeight = 56
    /** Folga entre o topo da janela e o painel. */
    var TOP_GAP = 8

    /** A faixa da barra cresce para caber o painel: a barra fica presa embaixo, na altura de antes. */
    function pinBar(pinned) {
      if (!bar) return
      if (pinned) {
        if (barStyle === null) {
          barStyle = bar.getAttribute('style') || ''
          var height = bar.offsetHeight || 56
          barHeight = height
          bar.style.position = 'absolute'
          bar.style.left = '0'
          bar.style.right = '0'
          bar.style.bottom = '0'
          bar.style.height = height + 'px'
          panel.style.bottom = (height + 8) + 'px'
        }
      } else if (barStyle !== null) {
        bar.setAttribute('style', barStyle)
        if (!barStyle) bar.removeAttribute('style')
        barStyle = null
      }
    }

    /** Faixa da barra do tamanho do painel inteiro (a janela do player limita; aí o painel rola). */
    function requestHeight() {
      if (!open || !bridge.projection.setSiteControlPanelOpen) return
      var needed = Math.ceil(panel.scrollHeight) + barHeight + TOP_GAP * 2
      void bridge.projection.setSiteControlPanelOpen(true, needed)
    }

    function setOpen(next) {
      open = Boolean(next)
      pinBar(open)
      panel.classList.toggle('is-open', open)
      panel.style.maxHeight = 'calc(100% - ' + (barHeight + TOP_GAP * 2) + 'px)'
      button.setAttribute('aria-expanded', open ? 'true' : 'false')
      if (open) {
        requestHeight()
        void reload()
      } else if (bridge.projection.setSiteControlPanelOpen) {
        void bridge.projection.setSiteControlPanelOpen(isOtherPanelOpen())
      }
    }

    function isOtherPanelOpen() {
      return Boolean(document.querySelector('.shell.is-panel-open'))
    }

    function renderMode() {
      Object.keys(modeButtons).forEach(function (key) {
        var on = key === mode
        modeButtons[key].classList.toggle('is-selected', on)
        modeButtons[key].setAttribute('aria-checked', on ? 'true' : 'false')
      })
      hint.textContent = MODE_HINT[mode]
      remoteHint.style.display = mode === 'share' ? 'block' : 'none'
    }

    function isLive() {
      return Boolean(active) || remoteLive.length > 0
    }

    function hasSelection() {
      return selDisplays.length > 0 || selRemotes.length > 0
    }

    function isEnabled(displayId) {
      return enabledIds == null || enabledIds.indexOf(displayId) >= 0
    }

    function toggleIn(list, value) {
      return list.indexOf(value) >= 0 ? list.filter(function (item) { return item !== value }) : list.concat([value])
    }

    function renderButton() {
      var live = isLive()
      button.classList.toggle('is-active', live)
      button.classList.toggle('is-armed', !live && hasSelection())
      button.title = live
        ? 'Projeção independente no ar'
        : hasSelection() ? 'Projeção independente pronta: clique na seta "Projetar"' : 'Projeção independente'
      syncProjectButton()
    }

    /** A seta precisa funcionar com destino independente escolhido, mesmo sem tela principal marcada. */
    function syncProjectButton() {
      if (!projectBtn) return
      if (projectBtn.disabled && (hasSelection() || isLive())) projectBtn.disabled = false
      if (isLive() !== projectBtn.classList.contains('ip-project-live')) projectBtn.classList.toggle('ip-project-live', isLive())
    }


    function item(name, meta, isActive, isOnAir, onClick, note) {
      var b = el('button', 'ip-item' + (isActive ? ' is-active' : ''))
      b.type = 'button'
      if (note) b.disabled = true
      b.setAttribute('role', 'checkbox')
      b.setAttribute('aria-checked', isActive ? 'true' : 'false')
      b.appendChild(el('span', 'ip-check'))
      var text = el('span')
      var title = el('span', 'ip-name', name)
      if (isOnAir) title.appendChild(el('span', 'ip-live', 'NO AR'))
      text.appendChild(title)
      if (meta) text.appendChild(el('span', 'ip-meta', meta))
      if (note) text.appendChild(el('span', 'ip-note', note))
      b.appendChild(text)
      b.addEventListener('click', onClick)
      return b
    }

    function renderMonitors() {
      monitorList.textContent = ''
      var extended = displays.filter(function (d) { return !d.isPrimary })
      if (extended.length === 0) {
        monitorList.appendChild(el('p', 'ip-empty', 'Nenhum monitor estendido encontrado.'))
        return
      }
      extended.forEach(function (d) {
        var onAir = Boolean(active && active.displayIds.indexOf(d.id) >= 0)
        // Monitor desligado no "Telas": aparece desativado (no ar, ainda dá para desmarcar).
        var off = !isEnabled(d.id) && !onAir
        monitorList.appendChild(item(d.label, d.resolution, selDisplays.indexOf(d.id) >= 0, onAir, function () { selectMonitor(d.id) }, off ? ENABLE_HINT : ''))
      })
    }

    function renderRemotes() {
      remoteList.textContent = ''
      var live = slots.filter(function (s) { return s.clients > 0 })
      if (live.length === 0) {
        remoteList.appendChild(el('p', 'ip-empty', 'Nenhuma conexão remota ativa.'))
        return
      }
      live.forEach(function (s) {
        remoteList.appendChild(item(s.label || 'Conexão ' + s.id, 'Conexões ativas: ' + s.clients, selRemotes.indexOf(s.id) >= 0, remoteLive.indexOf(s.id) >= 0, function () { selectRemote(s.id) }))
      })
    }

    function render() {
      renderMode()
      renderMonitors()
      renderRemotes()
      renderButton()
      requestHeight()
    }

    async function refreshState() {
      try {
        active = (await bridge.projection.getIndependentState()) || null
      } catch (error) {
        active = null
      }
      if (active) {
        mode = active.mode
        if (selDisplays.length === 0) selDisplays = active.displayIds.slice()
      }
    }

    async function reload() {
      try {
        var list = bridge.displays && bridge.displays.list ? (await bridge.displays.list()) || [] : []
        displays = list.map(function (d, index) {
          return {
            id: d.id,
            label: 'Monitor ' + (index + 1),
            resolution: d.bounds ? d.bounds.width + ' × ' + d.bounds.height : '',
            isPrimary: Boolean(d.isPrimary),
          }
        })
      } catch (error) {
        displays = []
      }
      try {
        enabledIds = bridge.projection.getIndependentEnabledDisplays
          ? ((await bridge.projection.getIndependentEnabledDisplays()) || []).map(Number)
          : null
      } catch (error) {
        enabledIds = null
      }
      try {
        slots = bridge.palco && bridge.palco.slots ? (await bridge.palco.slots()) || [] : []
      } catch (error) {
        slots = []
      }
      await refreshState()
      // Monitor que deixou de estar ativo sai da seleção (a seta não projeta nele).
      selDisplays = selDisplays.filter(function (id) { return isEnabled(id) || (active && active.displayIds.indexOf(id) >= 0) })
      render()
    }

    function selectMonitor(displayId) {
      selDisplays = toggleIn(selDisplays, displayId)
      render()
    }

    function selectRemote(slotId) {
      selRemotes = toggleIn(selRemotes, slotId)
      render()
    }

    function getSender() {
      if (sender || !window.PianoNetworkMirror) return sender
      sender = window.PianoNetworkMirror.createSender({
        capture: async function () {
          var sourceId = await bridge.projection.getSourceMediaId()
          if (!sourceId) throw new Error('Player indisponível.')
          return navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: sourceId, maxWidth: 1280, maxHeight: 720, maxFrameRate: 24 } } })
        },
        connectionsMuted: function () { return true },
        send: function (message, slotId) { return bridge.palco.send(message, slotId) },
      })
      return sender
    }

    /** Seta "Projetar" ligando: abre a independente nos destinos escolhidos. */
    async function startIndependent() {
      if (busy) return
      busy = true
      try {
        if (selDisplays.length > 0) await bridge.projection.openIndependent(selDisplays.slice(), mode)
        var mirror = selRemotes.length > 0 ? getSender() : null
        if (mirror) {
          for (var i = 0; i < selRemotes.length; i++) {
            try {
              await mirror.start(selRemotes[i])
              remoteLive = remoteLive.concat([selRemotes[i]])
            } catch (error) {
              console.warn('[independent-panel] conexão remota', selRemotes[i], error)
            }
          }
        }
        await refreshState()
      } finally {
        busy = false
        render()
      }
    }

    /** Seta "Projetar" desligando: tira a independente dos monitores e da conexão. */
    async function stopIndependent() {
      if (busy) return
      busy = true
      try {
        if (active) await bridge.projection.closeIndependent()
        if (sender) {
          for (var i = 0; i < remoteLive.length; i++) await sender.remove(remoteLive[i])
        }
        remoteLive = []
        await refreshState()
      } catch (error) {
        console.warn('[independent-panel] parar', error)
      } finally {
        busy = false
        render()
      }
    }

    if (projectBtn) {
      // Captura: decide antes da barra. Só a independente no ar → a seta só a desliga
      // (sem a barra ligar a principal por engano).
      projectBtn.addEventListener('click', function (event) {
        var mainOn = projectBtn.getAttribute('aria-pressed') === 'true'
        if (isLive() || mainOn) {
          if (isLive() && !mainOn) {
            event.stopImmediatePropagation()
            event.preventDefault()
          }
          void stopIndependent()
        } else if (hasSelection()) {
          void startIndependent()
        }
      }, true)
      if (window.MutationObserver) {
        new MutationObserver(syncProjectButton).observe(projectBtn, { attributes: true, attributeFilter: ['disabled', 'class'] })
      }
    }

    if (bridge.palco && bridge.palco.onEvent) {
      bridge.palco.onEvent(function (message) {
        if (!sender || remoteLive.length === 0) return
        sender.handle(message).catch(function (error) { console.warn('[independent-panel] espelho', error) })
      })
    }

    button.addEventListener('click', function () {
      if (!open && isOtherPanelOpen()) {
        var other = document.getElementById('monitorSelect')
        if (other) other.click()
      }
      setOpen(!open)
    })
    Object.keys(modeButtons).forEach(function (key) {
      modeButtons[key].addEventListener('click', function () {
        if (mode === key) return
        mode = key
        renderMode()
        // Já no ar: vale na próxima vez que projetar pela seta.
      })
    })
    identify.addEventListener('click', function () {
      if (bridge.displays && bridge.displays.identify) void bridge.displays.identify()
    })
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && open) setOpen(false)
    })
    // O painel "Selecionar telas" abriu: este fecha.
    var shell = document.querySelector('.shell')
    if (shell && window.MutationObserver) {
      new MutationObserver(function () {
        if (open && isOtherPanelOpen()) setOpen(false)
      }).observe(shell, { attributes: true, attributeFilter: ['class'] })
    }
    window.addEventListener('beforeunload', function () {
      if (sender) void sender.stop()
    })

    var poll = setInterval(function () {
      void refreshState().then(renderButton)
    }, 1500)

    // Controle remoto: mesma seleção do painel; projeta pela mesma seta.
    window.__independentControl = {
      snapshot: async function () {
        if (!open) await reload()
        return {
          mode: mode,
          live: isLive(),
          armed: !isLive() && hasSelection(),
          monitors: displays
            .filter(function (d) { return !d.isPrimary })
            .map(function (d) {
              var onAir = Boolean(active && active.displayIds.indexOf(d.id) >= 0)
              return {
                id: 'monitor:' + d.id,
                label: d.label,
                detail: d.resolution,
                selected: selDisplays.indexOf(d.id) >= 0,
                onAir: onAir,
                enabled: isEnabled(d.id) || onAir,
              }
            }),
          remotes: slots
            .filter(function (s) { return s.running || s.clients > 0 })
            .map(function (s) {
              return {
                id: 'tv:' + s.id,
                label: s.label || 'Conexão ' + s.id,
                detail: 'Conexões ativas: ' + s.clients,
                selected: selRemotes.indexOf(s.id) >= 0,
                onAir: remoteLive.indexOf(s.id) >= 0,
                enabled: true,
              }
            }),
        }
      },
      setMode: function (next) {
        if (!MODE_HINT[next]) return false
        mode = next
        renderMode()
        return true
      },
      setTarget: function (targetId, enabled) {
        var parts = String(targetId).split(':')
        var want = enabled === true
        if (parts[0] === 'monitor') {
          var displayId = Number(parts[1])
          var live = Boolean(active && active.displayIds.indexOf(displayId) >= 0)
          if (!Number.isFinite(displayId) || (want && !isEnabled(displayId) && !live)) return false
          if ((selDisplays.indexOf(displayId) >= 0) !== want) selDisplays = toggleIn(selDisplays, displayId)
        } else if (parts[0] === 'tv' && parts[1]) {
          if ((selRemotes.indexOf(parts[1]) >= 0) !== want) selRemotes = toggleIn(selRemotes, parts[1])
        } else {
          return false
        }
        render()
        return true
      },
    }

    renderMode()
    void reload()

    return {
      button: button,
      panel: panel,
      setOpen: setOpen,
      reload: reload,
      dispose: function () { clearInterval(poll) },
    }
  }

  window.PianoIndependentPanel = { mount: mount }
})()
