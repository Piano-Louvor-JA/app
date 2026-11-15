/**
 * Seletor de telas dos players igual ao do app (MonitorTargetSelect):
 * "Conexões Cabeadas" (monitores, com a marca de Tela retorno), "Conexões
 * Remotas" (nome do app, "Conexões ativas: N") e "TVs com Palco" (nome da TV,
 * transmissão; desmarcada fica na espera). O número no botão soma monitores e
 * conexões remotas marcadas, como no app.
 *
 * A Tela retorno e as conexões vivem na janela principal: o player pergunta
 * por `projection.screenContext()` e devolve a marca com `setRemoteSelected`.
 */
;(function () {
  var STYLE = [
    '.st-section{display:flex;align-items:center;gap:.4rem;margin:.75rem 0 .5rem;padding-top:.6rem;border-top:1px solid rgba(251,146,60,.45);color:#4ade80;font-size:.78rem;font-weight:700}',
    '.st-section svg{width:1rem;height:1rem;fill:currentColor}',
    '.st-tag{margin-left:.4rem;padding:.05rem .4rem;border-radius:999px;background:rgba(45,212,191,.18);color:#5eead4;font-size:.6rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;vertical-align:middle}',
    '.st-empty{margin:0;padding:.5rem .6rem;border-left:3px solid #fb923c;border-radius:.3rem;background:rgba(251,146,60,.1);color:#fb923c;font-size:.74rem;font-weight:600}',
  ].join('')
  var ICON_REMOTE = 'M7.76 16.24C6.67 15.16 6 13.66 6 12s.67-3.16 1.76-4.24l1.42 1.42C8.45 9.9 8 10.9 8 12s.45 2.1 1.17 2.83zm8.48 0-1.42-1.42C15.55 14.1 16 13.1 16 12s-.45-2.1-1.17-2.83l1.42-1.41C17.33 8.84 18 10.34 18 12s-.67 3.16-1.76 4.24M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4m8 2c0 2.21-.9 4.21-2.35 5.65l-1.42-1.42A5.95 5.95 0 0 0 18 12c0-1.66-.67-3.16-1.77-4.24l1.42-1.41A7.97 7.97 0 0 1 20 12M6.35 6.35 7.77 7.77A5.95 5.95 0 0 0 6 12c0 1.66.67 3.16 1.77 4.24l-1.42 1.41A7.97 7.97 0 0 1 4 12c0-2.21.9-4.21 2.35-5.65'
  var ICON_TV = 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2m0 14H3V5h18z'
  var TV_PLATFORMS = { webos: true, tizen: true, androidtv: true }

  var ctx = { returnDisplayId: null, remotes: [] }

  function api() {
    return window.louvorja || null
  }

  function injectStyle() {
    if (document.getElementById('screenTargetsStyle')) return
    var style = document.createElement('style')
    style.id = 'screenTargetsStyle'
    style.textContent = STYLE
    document.head.appendChild(style)
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
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

  function section(text, icon) {
    var title = document.createElement('p')
    title.className = 'st-section'
    title.appendChild(svg(icon))
    title.appendChild(document.createTextNode(text))
    return title
  }

  function option(name, meta, checked, onChange) {
    var label = document.createElement('label')
    label.className = 'panel__option' + (checked ? ' is-active' : '')
    var input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = checked
    input.addEventListener('change', function () {
      label.classList.toggle('is-active', input.checked)
      onChange(input.checked, input)
    })
    var body = document.createElement('span')
    body.className = 'panel__option-body'
    var nameEl = document.createElement('span')
    nameEl.className = 'panel__option-name'
    nameEl.textContent = name
    var metaEl = document.createElement('span')
    metaEl.className = 'panel__option-meta'
    metaEl.textContent = meta
    body.append(nameEl, metaEl)
    label.append(input, body)
    return { label: label, input: input }
  }

  function remoteOf(id) {
    for (var i = 0; i < ctx.remotes.length; i++) if (ctx.remotes[i].id === id) return ctx.remotes[i]
    return null
  }

  var T = {
    /** Contexto atual do app (Tela retorno + conexões). */
    load: async function () {
      var bridge = api()
      if (bridge && bridge.projection && bridge.projection.screenContext) {
        try {
          var next = await bridge.projection.screenContext()
          if (next && typeof next === 'object') ctx = { returnDisplayId: next.returnDisplayId == null ? null : next.returnDisplayId, remotes: Array.isArray(next.remotes) ? next.remotes : [] }
        } catch (e) { /* segue com o último */ }
      }
      return ctx
    },
    context: function () { return ctx },

    isReturn: function (displayId) { return ctx.returnDisplayId != null && ctx.returnDisplayId === displayId },
    /** Marca "Tela retorno" ao lado do nome do monitor (HTML). */
    returnTagHtml: function (displayId) { return T.isReturn(displayId) ? '<span class="st-tag">Tela retorno</span>' : '' },
    /** Mesma marca como elemento (null quando não é a Tela retorno). */
    returnTagElement: function (displayId) {
      if (!T.isReturn(displayId)) return null
      injectStyle()
      var tag = document.createElement('span')
      tag.className = 'st-tag'
      tag.textContent = 'Tela retorno'
      return tag
    },

    /** Mesmo nome do app: a conexão principal é "OBS"; as outras, o apelido. */
    remoteName: function (slot) {
      var remote = remoteOf(slot.id)
      if (remote && remote.name) return remote.name
      return slot.id === '0' ? 'OBS' : slot.label || 'Conexão ' + slot.id
    },
    remoteMeta: function (slot) { return 'Conexões ativas: ' + (Number(slot.clients) || 0) },
    /** Conexões no ar (como no app), ou com alguém conectado. */
    visibleRemotes: function (slots) {
      return (slots || []).filter(function (slot) { return slot.running === true || slot.clients > 0 })
    },
    /** A marca do app vale no player (o app é quem guarda). */
    applyRemoteSelection: function (checked) {
      for (var i = 0; i < ctx.remotes.length; i++) checked[ctx.remotes[i].id] = ctx.remotes[i].selected !== false
      return checked
    },
    setRemoteSelected: function (id, selected) {
      var remote = remoteOf(id)
      if (remote) remote.selected = selected
      var bridge = api()
      if (bridge && bridge.projection && bridge.projection.setRemoteSelected) {
        return Promise.resolve(bridge.projection.setRemoteSelected(id, selected)).catch(function () { return false })
      }
      return Promise.resolve(false)
    },
    remoteCount: function (slots, checked) {
      return T.visibleRemotes(slots).filter(function (slot) { return checked[slot.id] !== false }).length
    },

    /** Título "Conexões Remotas" e as conexões; `onToggle(slotId, checked)` faz o envio do player. */
    renderRemotes: function (container, slots, checked, onToggle) {
      injectStyle()
      container.replaceChildren()
      var visible = T.visibleRemotes(slots)
      if (!visible.length) return 0
      container.appendChild(section('Conexões Remotas', ICON_REMOTE))
      var list = document.createElement('div')
      list.className = 'panel__list'
      visible.forEach(function (slot) {
        var row = option(T.remoteName(slot), T.remoteMeta(slot), checked[slot.id] !== false, function (isChecked, input) {
          checked[slot.id] = isChecked
          void T.setRemoteSelected(slot.id, isChecked)
          onToggle(slot.id, isChecked, input)
        })
        row.input.setAttribute('data-tv', slot.id)
        list.appendChild(row.label)
      })
      container.appendChild(list)
      return visible.length
    },

    /** "TVs com Palco": marcada recebe a transmissão; desmarcada fica na espera (mesmo controle do app). */
    renderTvs: async function (container) {
      injectStyle()
      var bridge = api()
      if (!container || !bridge || !bridge.palco || !bridge.palco.clients) return
      var clients = []
      try { clients = (await bridge.palco.clients()) || [] } catch (e) { clients = [] }
      var tvs = clients.filter(function (client) { return TV_PLATFORMS[client.platform] })
      container.replaceChildren()
      container.appendChild(section('TVs com Palco', ICON_TV))
      if (!tvs.length) {
        var empty = document.createElement('p')
        empty.className = 'st-empty'
        empty.textContent = 'Nenhuma TV com o Palco conectada.'
        container.appendChild(empty)
        return
      }
      var list = document.createElement('div')
      list.className = 'panel__list'
      tvs.forEach(function (tv) {
        var meta = function (muted) { return muted ? tv.slotLabel + ' · na espera' : tv.slotLabel }
        var row = option(tv.name, meta(tv.muted), !tv.muted, async function (isChecked) {
          try { await bridge.palco.setClientMuted(tv.slotId, tv.uid, !isChecked) } catch (e) { /* TV saiu */ }
          await T.renderTvs(container)
        })
        list.appendChild(row.label)
      })
      container.appendChild(list)
    },

    /**
     * Fecha o seletor de telas ao clicar fora dele, quando o player perde o
     * foco (clique no slide ou em outra janela) e com Esc. O botão continua
     * abrindo e fechando.
     */
    closeOnOutside: function (options) {
      var panel = options.panel
      var trigger = options.trigger
      var openedAt = 0
      function isOpen() { return trigger.getAttribute('aria-expanded') === 'true' }
      function close() { if (isOpen()) void options.close() }
      trigger.addEventListener('click', function () { openedAt = Date.now() }, true)
      document.addEventListener('pointerdown', function (event) {
        var target = event.target
        if (!isOpen() || !(target instanceof Node)) return
        if (panel.contains(target) || trigger.contains(target)) return
        close()
      }, true)
      // o painel acabou de abrir: o foco ainda pode estar se ajustando
      window.addEventListener('blur', function () { if (Date.now() - openedAt > 300) close() })
      document.addEventListener('keydown', function (event) { if (event.key === 'Escape') close() })
    },

    escapeHtml: escapeHtml,
  }

  window.PianoScreenTargets = T
})()
