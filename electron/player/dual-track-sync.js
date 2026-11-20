/* Player com imagem e som em trilhas separadas (vídeo do YouTube ainda baixando).
   O <video> é o que a barra de controle comanda (play, pausa, busca, volume); o <audio> acompanha.
   O som é o relógio: a imagem se ajusta a ele pelo playbackRate e, em saltos grandes, pelo currentTime.
   Quando uma trilha espera dados, a outra para até as duas terem dados. */
;(function (root) {
  var SOFT_DRIFT = 0.08
  var HARD_DRIFT = 0.5
  var MAX_RATE_DELTA = 0.05
  var SAME_POSITION = 0.05
  var TICK_MS = 250

  function attach(video, audio, options) {
    var opts = options || {}
    var setTick = opts.setInterval || root.setInterval.bind(root)
    var clearTick = opts.clearInterval || root.clearInterval.bind(root)
    var heldByAudio = false
    var listeners = []

    function on(target, type, fn) {
      target.addEventListener(type, fn)
      listeners.push([target, type, fn])
    }
    function quiet(promise) {
      if (promise && typeof promise.catch === 'function') promise.catch(function () {})
    }

    on(video, 'play', function () {
      quiet(audio.play())
    })
    on(video, 'pause', function () {
      audio.pause()
    })
    on(video, 'seeking', function () {
      if (Math.abs(video.currentTime - audio.currentTime) > SAME_POSITION) audio.currentTime = video.currentTime
    })
    on(video, 'volumechange', function () {
      audio.volume = video.volume
      audio.muted = video.muted
    })
    on(video, 'waiting', function () {
      audio.pause()
    })
    on(video, 'playing', function () {
      if (audio.paused) quiet(audio.play())
    })
    on(video, 'ended', function () {
      audio.pause()
    })
    on(audio, 'waiting', function () {
      if (video.paused) return
      heldByAudio = true
      video.pause()
    })
    on(audio, 'canplay', resumeFromAudio)
    on(audio, 'playing', resumeFromAudio)
    on(audio, 'error', function () {
      if (typeof opts.onError === 'function') opts.onError()
    })

    function resumeFromAudio() {
      if (!heldByAudio) return
      heldByAudio = false
      quiet(video.play())
    }

    function tick() {
      if (video.paused || audio.paused || video.seeking || audio.seeking) return
      var drift = video.currentTime - audio.currentTime
      if (Math.abs(drift) > HARD_DRIFT) {
        video.playbackRate = 1
        video.currentTime = audio.currentTime
      } else if (Math.abs(drift) > SOFT_DRIFT) {
        var delta = Math.min(MAX_RATE_DELTA, Math.abs(drift) / 2)
        video.playbackRate = drift > 0 ? 1 - delta : 1 + delta
      } else if (video.playbackRate !== 1) {
        video.playbackRate = 1
      }
    }
    var timer = setTick(tick, TICK_MS)

    audio.volume = video.volume
    audio.muted = video.muted

    return {
      tick: tick,
      detach: function () {
        clearTick(timer)
        listeners.forEach(function (entry) { entry[0].removeEventListener(entry[1], entry[2]) })
        listeners = []
      },
    }
  }

  root.LouvorjaDualTrack = { attach: attach }
})(globalThis)
