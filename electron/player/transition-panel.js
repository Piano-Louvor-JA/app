/*
 * Caixa "Animação" + painel de transições das barras de controle dos players
 * (imagens e PDF/apresentação). Mesmo painel do app: cartões com prévia e a
 * velocidade. Depende de screen-transitions.js.
 *
 * Uso: PianoTransitionPanel.mount({ slot, shell, monitorButton })
 *   slot          — onde ficam a caixa e o botão (meio da barra)
 *   shell         — container da barra (o painel abre por cima dela)
 *   monitorButton — botão do painel de monitores (os dois não abrem juntos)
 */
;(function () {
  var PANEL_HEIGHT = 470
  var SAMPLES = ['Slide 1', 'Slide 2']

  var CSS = [
    '.tp-slot{display:flex;align-items:center;justify-content:flex-start;gap:.5rem;min-width:0}',
    '.tp-check{display:inline-flex;align-items:center;gap:.4rem;color:#e8edf5;font:500 .78rem/1 system-ui,sans-serif;cursor:pointer;white-space:nowrap}',
    '.tp-check input{width:.95rem;height:.95rem;margin:0;accent-color:#e0895a;cursor:pointer}',
    '.tp-open{display:inline-flex;align-items:center;gap:.4rem;max-width:12rem;height:2rem;padding:0 .6rem;border:1px solid rgba(232,237,245,.16);border-radius:.45rem;background:rgba(26,30,40,.95);color:#e8edf5;font:600 .76rem/1 system-ui,sans-serif;cursor:pointer;width:auto}',
    '.tp-open:hover{border-color:rgba(224,137,90,.6);color:#f0c4a8}',
    '.tp-open span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.tp-open[hidden]{display:none}',
    '.tp-panel{display:none;position:absolute;left:50%;bottom:3.25rem;transform:translateX(-50%);width:min(44rem,calc(100% - 1rem));max-height:calc(100% - 3.75rem);padding:.85rem;border:1px solid rgba(232,237,245,.12);border-radius:.65rem;background:rgba(26,30,40,.97);box-shadow:0 14px 36px rgba(0,0,0,.45);overflow:auto;color:#e8edf5;font-family:system-ui,sans-serif}',
    '.shell.is-tp-open .tp-panel{display:block}',
    '.shell.is-tp-open .bar{position:absolute;inset:auto 0 0;height:48px}',
    '.tp-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.65rem}',
    '.tp-head h2{margin:0;font-size:1rem;font-weight:600}',
    '.tp-close{width:1.9rem;height:1.9rem;border:0;border-radius:999px;background:rgba(232,237,245,.08);color:#e8edf5;font-size:1rem;cursor:pointer}',
    '.tp-label{margin:.75rem 0 .45rem;font-size:.68rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(232,237,245,.6)}',
    '.tp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(6.6rem,1fr));gap:.5rem}',
    '.tp-card{position:relative;display:flex;flex-direction:column;gap:.35rem;width:auto;height:auto;padding:.4rem;border:1px solid rgba(232,237,245,.12);border-radius:.55rem 0 .55rem 0;background:rgba(232,237,245,.04);color:#e8edf5;text-align:left;cursor:pointer}',
    '.tp-card:hover{border-color:rgba(224,137,90,.55)}',
    '.tp-card.is-active{border-color:#e0895a;background:rgba(224,137,90,.14);box-shadow:0 0 12px rgba(224,137,90,.22)}',
    '.tp-preview{position:relative;display:grid;place-items:center;height:3.1rem;overflow:hidden;border-radius:.35rem 0 .35rem 0;background:linear-gradient(135deg,#0b0b0f,#1c1c24)}',
    '.tp-sample{display:block;padding:.15rem .4rem;color:#fff;font-size:.72rem;font-weight:700}',
    '.tp-name{font-size:.72rem;font-weight:600}',
    '.tp-tick{position:absolute;top:.25rem;right:.3rem;display:grid;place-items:center;width:1rem;height:1rem;border-radius:999px;background:#e0895a;color:#1a1a1a;font-size:.65rem;font-weight:700}',
    '.tp-speed{display:inline-flex;gap:.25rem;padding:.25rem;border-radius:.5rem;background:rgba(232,237,245,.06)}',
    '.tp-speed button{width:auto;height:auto;padding:.4rem 1rem;border:0;border-radius:.4rem;background:transparent;color:#e8edf5;font-size:.78rem;cursor:pointer}',
    '.tp-speed button.is-active{background:rgba(224,137,90,.22);color:#f0c4a8;font-weight:600}',
  ].join('\n')

  function el(tag, cls, text) {
    var node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
  }

  function labelOf(api, name) {
    for (var i = 0; i < api.OPTIONS.length; i += 1) {
      if (api.OPTIONS[i][0] === name) return api.OPTIONS[i][1]
    }
    return name
  }

  function mount(options) {
    var api = window.PianoScreenTransition
    var slot = options && options.slot
    var shell = options && options.shell
    var monitorButton = options && options.monitorButton
    if (!api || !slot || !shell) return

    var style = el('style')
    style.textContent = CSS
    document.head.appendChild(style)

    // Caixa + botão na barra
    slot.classList.add('tp-slot')
    var check = el('label', 'tp-check')
    var checkbox = el('input')
    checkbox.type = 'checkbox'
    checkbox.setAttribute('aria-label', 'Animação ao trocar')
    check.appendChild(checkbox)
    check.appendChild(document.createTextNode('Animação'))
    var openBtn = el('button', 'tp-open')
    openBtn.type = 'button'
    openBtn.title = 'Escolher a animação e a velocidade'
    openBtn.setAttribute('aria-haspopup', 'dialog')
    openBtn.setAttribute('aria-expanded', 'false')
    var openName = el('span')
    openBtn.appendChild(openName)
    openBtn.appendChild(document.createTextNode('▸'))
    slot.appendChild(check)
    slot.appendChild(openBtn)

    // Painel
    var panel = el('div', 'tp-panel')
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', 'Animações de transição')
    var head = el('div', 'tp-head')
    head.appendChild(el('h2', null, 'Animação ao trocar'))
    var close = el('button', 'tp-close', '✕')
    close.type = 'button'
    close.setAttribute('aria-label', 'Fechar')
    head.appendChild(close)
    panel.appendChild(head)
    panel.appendChild(el('p', 'tp-label', 'Transição'))
    var grid = el('div', 'tp-grid')
    grid.setAttribute('role', 'radiogroup')
    grid.setAttribute('aria-label', 'Transição')
    panel.appendChild(grid)
    panel.appendChild(el('p', 'tp-label', 'Velocidade'))
    var speedBox = el('div', 'tp-speed')
    speedBox.setAttribute('role', 'radiogroup')
    speedBox.setAttribute('aria-label', 'Velocidade')
    ;[['fast', 'Rápida'], ['normal', 'Normal'], ['slow', 'Lenta']].forEach(function (opt) {
      var b = el('button', null, opt[1])
      b.type = 'button'
      b.setAttribute('role', 'radio')
      b.dataset.speed = opt[0]
      b.addEventListener('click', function () {
        api.save({ speed: opt[0] })
        render()
      })
      speedBox.appendChild(b)
    })
    panel.appendChild(speedBox)
    shell.appendChild(panel)

    var cards = {}
    var hovered = null
    api.OPTIONS.forEach(function (opt) {
      var name = opt[0]
      var card = el('button', 'tp-card')
      card.type = 'button'
      card.setAttribute('role', 'radio')
      var preview = el('span', 'tp-preview')
      var sample = el('span', 'tp-sample', SAMPLES[0])
      preview.appendChild(sample)
      card.appendChild(preview)
      card.appendChild(el('span', 'tp-name', opt[1]))
      card.addEventListener('mouseenter', function () { hovered = name; playDemo(name) })
      card.addEventListener('mouseleave', function () { if (hovered === name) hovered = null })
      card.addEventListener('click', function () {
        api.save({ transition: name, enabled: true })
        render()
        playDemo(name)
      })
      grid.appendChild(card)
      cards[name] = { card: card, sample: sample, busy: false, step: 0 }
    })

    function playDemo(name) {
      var item = cards[name]
      if (!item || item.busy) return
      item.busy = true
      api.demo(item.sample, name, api.read().speed, function () {
        item.step += 1
        item.sample.textContent = SAMPLES[item.step % SAMPLES.length]
      }).then(function () {
        item.busy = false
      })
    }

    // A escolhida e a sob o mouse ficam repetindo a prévia enquanto o painel está aberto.
    var loop = null
    function startLoop() {
      if (loop) return
      loop = setInterval(function () {
        var current = api.read().transition
        playDemo(current)
        if (hovered && hovered !== current) playDemo(hovered)
      }, 1600)
    }
    function stopLoop() {
      if (loop) clearInterval(loop)
      loop = null
    }

    var open = false
    async function setOpen(next) {
      // Fecha o painel de monitores antes (o clique dele fecharia este se já estivesse aberto).
      if (next && shell.classList.contains('is-panel-open') && monitorButton) monitorButton.click()
      open = Boolean(next)
      shell.classList.toggle('is-tp-open', open)
      openBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
      if (open) startLoop()
      else stopLoop()
      try {
        await window.louvorja?.projection?.setSiteControlPanelOpen?.(open, open ? PANEL_HEIGHT : undefined)
      } catch (e) {
        /* sem preload: o painel só aparece dentro da barra */
      }
    }

    function render() {
      var current = api.read()
      checkbox.checked = current.enabled
      openBtn.hidden = !current.enabled
      openName.textContent = labelOf(api, current.transition)
      Object.keys(cards).forEach(function (name) {
        var active = name === current.transition
        cards[name].card.classList.toggle('is-active', active)
        cards[name].card.setAttribute('aria-checked', active ? 'true' : 'false')
        var tick = cards[name].card.querySelector('.tp-tick')
        if (active && !tick) cards[name].card.appendChild(el('span', 'tp-tick', '✓'))
        if (!active && tick) tick.remove()
      })
      Array.prototype.forEach.call(speedBox.children, function (b) {
        var active = b.dataset.speed === current.speed
        b.classList.toggle('is-active', active)
        b.setAttribute('aria-checked', active ? 'true' : 'false')
      })
      if (!current.enabled && open) void setOpen(false)
    }

    checkbox.addEventListener('change', function () {
      api.save({ enabled: checkbox.checked })
      render()
      // Ao ligar, já abre o painel para escolher.
      if (checkbox.checked) void setOpen(true)
    })
    openBtn.addEventListener('click', function () { void setOpen(!open) })
    close.addEventListener('click', function () { void setOpen(false) })
    if (monitorButton) {
      monitorButton.addEventListener('click', function () {
        if (open) {
          open = false
          shell.classList.remove('is-tp-open')
          openBtn.setAttribute('aria-expanded', 'false')
          stopLoop()
        }
      }, true)
    }
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && open) void setOpen(false)
    })
    window.addEventListener('storage', function (event) {
      if (event.key === api.STORAGE_KEY) render()
    })
    render()
  }

  window.PianoTransitionPanel = { mount: mount }
})()
