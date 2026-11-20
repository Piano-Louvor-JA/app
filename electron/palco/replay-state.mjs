/** Keep replay consistent: waiting state and active primary content are exclusive. */
export function updateReplayState(cache, message) {
  if (message.type === 'idle') {
    for (const type of ['projection', 'timer', 'clock']) cache.delete(type)
  }
  if (['projection', 'timer', 'clock'].includes(message.type) && message.obsPane !== true) cache.delete('idle')
  if (message.type === 'obsShare' && !message.enabled) cache.delete('obs-secondary')
  cache.set(message.obsPane === true ? 'obs-secondary' : message.type, message)
}
