import { formatElapsedMs as formatTimer } from '@modules/timer/services/timer-format'
import { formatElapsedMs as formatCountdown, computeCountdownRemainingMs } from '@modules/countdown/services/countdown-format'
import { palcoSession } from './palco-session'
import { type ObsModule } from './obs-connections'
import { readBibleIndependentFromStorage } from '@modules/bible/services/bible-independent-runtime'
import { readTimerRuntimeFromStorage } from '@modules/timer/services/timer-runtime'
import { readCountdownRuntimeFromStorage } from '@modules/countdown/services/countdown-runtime'
import { readRandomRuntimeFromStorage } from '@modules/random/services/random-runtime'

function elapsed(runtime: { status: string; accumulatedMs: number; segmentStartedAt: number | null }) {
  return runtime.accumulatedMs + (runtime.status === 'running' && runtime.segmentStartedAt
    ? Math.max(0, Date.now() - runtime.segmentStartedAt) : 0)
}
/** Renderização independente não publica intenção nem toma a projeção principal. */
export async function renderObsModule(slotId: string, module: ObsModule) {
  if (module === 'bible') {
    const runtime = readBibleIndependentFromStorage()
    return palcoSession.projectTo(slotId, 'bible', { text: runtime.text.split('\n').join('<br>'), footerRef: runtime.reference })
  }
  if (module === 'clock') {
    const now = new Date()
    return palcoSession.projectTo(slotId, 'clock', { text: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` })
  }
  if (module === 'random') {
    return palcoSession.projectTo(slotId, 'random', { text: readRandomRuntimeFromStorage().currentDisplay })
  }
  if (module === 'timer') {
    const runtime = readTimerRuntimeFromStorage()
    return palcoSession.projectTo(slotId, 'timer', { text: formatTimer(elapsed(runtime), 'hh:mm:ss') })
  }
  const runtime = readCountdownRuntimeFromStorage()
  return palcoSession.projectTo(slotId, 'countdown', { text: formatCountdown(Math.max(0, computeCountdownRemainingMs(runtime, Date.now())), 'hh:mm:ss') })
}
