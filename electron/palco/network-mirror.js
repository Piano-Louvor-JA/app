/* Shared by the trusted Electron control bar and LAN receivers. Media stays
   peer-to-peer on the LAN; authenticated Palco sockets carry signaling only. */
;(function (root) {
  function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
  function peer() { return new RTCPeerConnection({ iceServers: [] }) }
  function createSender(options) {
    var sessionId = id(), stream = null, pending = null, generation = 0
    var slots = new Set(), peers = new Map()
    async function capture() {
      if (stream) return stream
      if (!pending) {
        var version = generation
        pending = options.capture().then(function (value) {
          if (version !== generation) { value.getTracks().forEach(function (track) { track.stop() }); throw new Error('Projeção encerrada') }
          stream = value; return value
        }).finally(function () { pending = null })
      }
      return pending
    }
    async function handle(message) {
      if (!message || message.type !== 'mirror-signal' || message.sessionId !== sessionId || !slots.has(message.slotId)) return
      if (typeof message.receiverId !== 'string' || message.receiverId.length > 100) return
      var key = message.slotId + ':' + message.receiverId
      var entry = peers.get(key)
      if (message.action === 'request') {
        var media = await capture()
        if (!slots.has(message.slotId)) return
        if (entry) entry.pc.close()
        var pc = peer()
        entry = { pc: pc, candidates: [] }; peers.set(key, entry)
        media.getTracks().forEach(function (track) { pc.addTrack(track, media) })
        pc.onicecandidate = function (event) {
          if (event.candidate) void options.send({ v: 2, type: 'mirror-signal', action: 'candidate', sessionId: sessionId, receiverId: message.receiverId, candidate: event.candidate.toJSON() }, message.slotId)
        }
        pc.onconnectionstatechange = function () {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { pc.close(); if (peers.get(key) === entry) peers.delete(key) }
        }
        await pc.setLocalDescription(await pc.createOffer())
        if (peers.get(key) !== entry) return
        await options.send({ v: 2, type: 'mirror-signal', action: 'offer', sessionId: sessionId, receiverId: message.receiverId, description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }, message.slotId)
      } else if (entry && message.action === 'answer') {
        await entry.pc.setRemoteDescription(message.description)
        for (var candidate of entry.candidates) await entry.pc.addIceCandidate(candidate)
        entry.candidates = []
      } else if (entry && message.action === 'candidate') {
        if (entry.pc.remoteDescription) await entry.pc.addIceCandidate(message.candidate)
        else entry.candidates.push(message.candidate)
      } else if (entry && message.action === 'leave') {
        entry.pc.close(); peers.delete(key)
      }
    }
    return {
      handle: handle,
      prepare: capture,
      start: async function (slotId) {
        await capture(); slots.add(slotId)
        await options.send({ v: 2, type: 'video', cleanMirror: true, mirrorSession: sessionId, connectionsMuted: options.connectionsMuted?.() === true }, slotId)
      },
      remove: async function (slotId) {
        slots.delete(slotId)
        for (var pair of peers) if (pair[0].startsWith(slotId + ':')) { pair[1].pc.close(); peers.delete(pair[0]) }
        await options.send({ v: 2, type: 'video', action: 'stop' }, slotId)
      },
      stop: async function () {
        generation++
        for (var entry of peers.values()) entry.pc.close()
        peers.clear()
        if (stream) stream.getTracks().forEach(function (track) { track.stop() })
        stream = null
        var targets = Array.from(slots); slots.clear(); sessionId = id()
        await Promise.all(targets.map(function (slotId) { return options.send({ v: 2, type: 'video', action: 'stop' }, slotId) }))
      },
    }
  }
  function createReceiver(options) {
    var receiverId = id(), sessionId = null, pc = null, candidates = []
    function signal(action, extra) { options.send(Object.assign({ v: 2, type: 'mirror-signal', action: action, receiverId: receiverId, sessionId: sessionId }, extra)) }
    function stop() {
      if (sessionId) signal('leave')
      sessionId = null
      if (pc) pc.close()
      pc = null; candidates = []; options.clear()
    }
    return {
      active: function () { return Boolean(sessionId) },
      stop: stop,
      start: function (next) {
        if (sessionId === next && pc && pc.connectionState !== 'failed') return
        stop(); sessionId = next; signal('request')
      },
      handle: async function (message) {
        if (message.receiverId !== receiverId || message.sessionId !== sessionId || !sessionId) return
        if (message.action === 'offer') {
          if (pc) pc.close()
          var current = peer(), attachedStream = null; pc = current
          current.ontrack = function (event) {
            if (pc === current && event.streams[0] && event.streams[0] !== attachedStream) {
              attachedStream = event.streams[0]; options.attach(attachedStream)
            }
          }
          current.onicecandidate = function (event) { if (pc === current && event.candidate) signal('candidate', { candidate: event.candidate.toJSON() }) }
          current.onconnectionstatechange = function () { if (pc === current && current.connectionState === 'failed') options.error?.('A transmissão foi interrompida. Projete novamente.') }
          await current.setRemoteDescription(message.description)
          for (var candidate of candidates) await current.addIceCandidate(candidate)
          candidates = []
          await current.setLocalDescription(await current.createAnswer())
          if (pc === current) signal('answer', { description: { type: current.localDescription.type, sdp: current.localDescription.sdp } })
        } else if (message.action === 'candidate') {
          if (pc && pc.remoteDescription) await pc.addIceCandidate(message.candidate)
          else candidates.push(message.candidate)
        }
      },
    }
  }
  root.PianoNetworkMirror = { createSender: createSender, createReceiver: createReceiver }
})(globalThis)
