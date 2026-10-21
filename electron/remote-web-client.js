/* Contrôle local : aucune ressource tierce ni persistance du code. */
(() => {
  const translations = {
    'pt-BR': { title:'Controle do culto', hint:'Conecte o celular à mesma rede do computador e use o código exibido em Configurações → Controle remoto.', code:'Código de pareamento', connect:'Conectar', disconnect:'Desconectar', player:'Reprodução', previous:'Anterior', playPause:'Reproduzir / pausar', next:'Próximo', stop:'Parar', done:'Concluir momento', refresh:'Atualizar', volume:'Volume', plan:'Programa do culto', waiting:'Aguardando conexão…', tools:'Projeção e tempo', clearBible:'Limpar Bíblia', timerStart:'Iniciar cronômetro', timerPause:'Pausar cronômetro', countdownStart:'Iniciar contagem', countdownPause:'Pausar contagem', footer:'O computador precisa permanecer aberto. Use o programa preparado pelo operador.', connected:'Conectado ao computador', connecting:'Conectando…', closed:'Desconectado. Conecte novamente para continuar.', error:'Não foi possível conectar. Confira o código e a rede.', rejected:'O comando não foi executado. Verifique o computador.', empty:'Nenhum momento no programa selecionado.', busy:'Outro controle já está conectado.', badToken:'Código incorreto.', desktopClosed:'O aplicativo no computador foi fechado.' },
    fr: { title:'Télécommande du culte', hint:'Connectez le téléphone au même réseau que l’ordinateur et utilisez le code affiché dans Paramètres → Télécommande.', code:'Code d’appairage', connect:'Connecter', disconnect:'Déconnecter', player:'Lecture', previous:'Précédent', playPause:'Lire / pause', next:'Suivant', stop:'Arrêter', done:'Terminer ce moment', refresh:'Actualiser', volume:'Volume', plan:'Programme du culte', waiting:'En attente de connexion…', tools:'Projection et temps', clearBible:'Effacer la Bible', timerStart:'Démarrer le chronomètre', timerPause:'Pause du chronomètre', countdownStart:'Démarrer le compte à rebours', countdownPause:'Pause du compte à rebours', footer:'L’application sur l’ordinateur doit rester ouverte. Utilisez le programme préparé par l’opérateur.', connected:'Connecté à l’ordinateur', connecting:'Connexion…', closed:'Déconnecté. Reconnectez-vous pour continuer.', error:'Connexion impossible. Vérifiez le code et le réseau.', rejected:'La commande n’a pas été exécutée. Vérifiez l’ordinateur.', empty:'Aucun moment dans le programme sélectionné.', busy:'Une autre télécommande est déjà connectée.', badToken:'Code incorrect.', desktopClosed:'L’application sur l’ordinateur a été fermée.' },
    es: { title:'Control del culto', hint:'Conecte el teléfono a la misma red que el ordenador y use el código de Configuración → Control remoto.', code:'Código de emparejamiento', connect:'Conectar', disconnect:'Desconectar', player:'Reproducción', previous:'Anterior', playPause:'Reproducir / pausa', next:'Siguiente', stop:'Detener', done:'Completar momento', refresh:'Actualizar', volume:'Volumen', plan:'Programa del culto', waiting:'Esperando conexión…', tools:'Proyección y tiempo', clearBible:'Limpiar Biblia', timerStart:'Iniciar cronómetro', timerPause:'Pausar cronómetro', countdownStart:'Iniciar cuenta atrás', countdownPause:'Pausar cuenta atrás', footer:'La aplicación del ordenador debe permanecer abierta. Use el programa preparado por el operador.', connected:'Conectado al ordenador', connecting:'Conectando…', closed:'Desconectado. Conecte de nuevo para continuar.', error:'No se pudo conectar. Compruebe el código y la red.', rejected:'No se ejecutó el comando. Compruebe el ordenador.', empty:'No hay momentos en el programa seleccionado.', busy:'Otro control ya está conectado.', badToken:'Código incorrecto.', desktopClosed:'Se cerró la aplicación del ordenador.' },
  }
  const byId = id => document.getElementById(id)
  const language = byId('language'), tokenInput = byId('token'), status = byId('status')
  let ws = null, authenticated = false, state = null, statusKey = 'waiting', counter = 0
  language.value = navigator.language.startsWith('fr') ? 'fr' : navigator.language.startsWith('es') ? 'es' : 'pt-BR'
  function text(key) { return translations[language.value]?.[key] ?? translations['pt-BR'][key] ?? key }
  function setStatus(key) { statusKey = key; status.textContent = text(key); status.dataset.connected = String(authenticated) }
  function enable(value) {
    document.querySelectorAll('[data-action],#volume').forEach(element => { element.disabled = !value })
    tokenInput.disabled = value; byId('connect').hidden = value; byId('disconnect').hidden = !value
  }
  function command(action, extra = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (!authenticated && action !== 'liturgy.state') return
    ws.send(JSON.stringify({ v:1, type:'command', id:`web-${++counter}`, action, token:tokenInput.value.trim(), ...extra }))
  }
  function renderState() {
    byId('title').textContent = state?.player?.title || '—'
    if (typeof state?.player?.volume === 'number') byId('volume').value = String(state.player.volume)
    const list = byId('items'); list.replaceChildren()
    const items = Array.isArray(state?.liturgy?.items) ? state.liturgy.items : []
    byId('empty').hidden = items.length > 0
    byId('empty').textContent = text(authenticated ? 'empty' : 'waiting')
    for (const item of items) {
      const li = document.createElement('li')
      if (item.isCategory) { li.className = 'group'; li.textContent = item.title || '—' }
      else {
        const button = document.createElement('button'); button.type = 'button'; button.disabled = !authenticated
        button.setAttribute('aria-current', String(state.liturgy.selectedIndex === item.index))
        if (item.done) button.className = 'item-done'
        const label = document.createElement('span'); label.textContent = item.title || '—'
        if (item.responsible) { const small = document.createElement('small'); small.textContent = item.responsible; label.appendChild(small) }
        button.appendChild(label); button.addEventListener('click', () => command('liturgy.select', { index:item.index, value:item.index })); li.appendChild(button)
      }
      list.appendChild(li)
    }
  }
  function translate() {
    document.documentElement.lang = language.value
    document.title = text('title')
    document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = text(element.dataset.i18n) })
    setStatus(statusKey); renderState()
  }
  function disconnect() { const previous = ws; ws = null; previous?.close(); authenticated = false; state = null; enable(false); setStatus('closed'); renderState() }
  byId('connect-form').addEventListener('submit', event => {
    event.preventDefault(); if (!tokenInput.value.trim()) return
    disconnect(); setStatus('connecting')
    const connection = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`)
    ws = connection
    connection.onopen = () => { if (ws !== connection) return; connection.send(JSON.stringify({ v:1, type:'hello', device:'Navegador / navigateur' })); command('liturgy.state') }
    connection.onmessage = event => {
      if (ws !== connection) return
      let message; try { message = JSON.parse(event.data) } catch { return }
      if (message.v !== 1) return
      if (message.type === 'ping') { connection.send(JSON.stringify({v:1,type:'pong'})); return }
      if (message.type === 'error') { authenticated = false; enable(false); setStatus(({ bad_token:'badToken', remote_busy:'busy', desktop_closed:'desktopClosed' })[message.code] || 'error'); return }
      if (message.type === 'ack') {
        if (!authenticated && message.ok) { authenticated = true; enable(true); setStatus('connected') }
        else if (!message.ok) setStatus('rejected')
      }
      if (message.type === 'state' && authenticated) { state = message; renderState() }
    }
    connection.onerror = () => { if (ws === connection) setStatus('error') }
    connection.onclose = () => { if (ws !== connection) return; ws = null; authenticated = false; enable(false); renderState(); if (!['badToken','busy','desktopClosed','error'].includes(statusKey)) setStatus('closed') }
  })
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => command(button.dataset.action)))
  byId('volume').addEventListener('change', () => command('player.setVolume', { value:Number(byId('volume').value) }))
  byId('disconnect').addEventListener('click', disconnect)
  language.addEventListener('change', translate)
  window.addEventListener('pagehide', disconnect)
  const params = new URLSearchParams(location.hash.slice(1))
  if (params.get('token')) tokenInput.value = params.get('token').slice(0,64)
  history.replaceState(null,'',location.pathname)
  enable(false); translate()
})()
