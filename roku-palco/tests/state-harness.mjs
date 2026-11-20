export function initialState() {
  return {
    mode: 'idle', connected: false, backgroundUrl: '',
    projection: { text: '', footer: '' },
    timer: { visible: false, action: 'stop', duration: 0, label: '' },
    audio: { action: 'stop', url: '', positionMs: 0 },
    video: { action: 'stop', url: '', positionMs: 0 },
    connection: { ip: '', slot: -1, slotLabel: '' },
  }
}

export function reduceState(state, message) {
  const next = structuredClone(state)
  switch (message.type) {
    case 'projection':
      next.mode = 'projection'; next.projection.text = String(message.text ?? ''); next.projection.footer = String(message.footer ?? ''); break
    case 'bgPalco': next.backgroundUrl = String(message.url ?? ''); break
    case 'idle': next.mode = 'idle'; next.audio.action = 'stop'; next.video.action = 'stop'; break
    case 'youare': next.connection = { ip: String(message.ip ?? ''), slot: Number(message.slot ?? -1), slotLabel: String(message.slotLabel ?? '') }; break
    case 'timer': next.mode = message.action === 'stop' ? 'idle' : 'timer'; next.timer = { visible: message.action !== 'stop', action: String(message.action ?? ''), duration: Number(message.duration ?? 0), label: String(message.label ?? '') }; break
    case 'audio': next.audio = { action: String(message.action ?? 'stop'), url: String(message.url ?? ''), positionMs: Number(message.positionMs ?? message.position ?? 0) }; break
    case 'video': next.video = { action: String(message.action ?? 'stop'), url: String(message.url ?? ''), positionMs: Number(message.positionMs ?? message.position ?? 0) }; break
    case 'connectionLost': next.mode = 'idle'; next.connected = false; next.audio.action = 'stop'; next.video.action = 'stop'; break
  }
  return next
}
