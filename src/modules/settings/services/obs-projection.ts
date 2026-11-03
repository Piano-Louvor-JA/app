import { loadTimerDisplayConfig } from '@modules/timer/services/timer-preferences'
import { formatElapsedMs as formatCountdown, computeCountdownRemainingMs } from '@modules/countdown/services/countdown-format'
import { palcoSession } from './palco-session'
import { type ObsModule } from './obs-connections'
import { readBibleIndependentFromStorage } from '@modules/bible/services/bible-independent-runtime'
import { readTimerRuntimeFromStorage } from '@modules/timer/services/timer-runtime'
import { readCountdownRuntimeFromStorage } from '@modules/countdown/services/countdown-runtime'
import { readRandomRuntimeFromStorage } from '@modules/random/services/random-runtime'

/** Renderização independente não publica intenção nem toma a projeção principal. */
export async function renderObsModule(slotId: string, module: ObsModule, obsPane = false) {
  if (module === 'bible') {
    const runtime = readBibleIndependentFromStorage()
    return palcoSession.projectTo(slotId, 'bible', { ...(obsPane ? { obsPane: true } : {}), text: runtime.text.split('\n').join('<br>'), footerRef: runtime.reference })
  }
  if (module === 'clock') {
    const now = new Date()
    return palcoSession.projectTo(slotId, 'clock', { ...(obsPane ? { obsPane: true } : {}), text: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}` })
  }
  if (module === 'random') {
    return palcoSession.projectTo(slotId, 'random', { ...(obsPane ? { obsPane: true } : {}), text: readRandomRuntimeFromStorage().currentDisplay })
  }
  if (module === 'timer') {
    const runtime = readTimerRuntimeFromStorage()
    return palcoSession.timerTo(slotId, { mode: 'chrono', obsPane, timeFormat: loadTimerDisplayConfig().timeFormat, chronoRuntime: { status: runtime.status, accumulatedMs: runtime.accumulatedMs, segmentStartedAt: runtime.segmentStartedAt } })
  }
  const runtime = readCountdownRuntimeFromStorage()
  return palcoSession.projectTo(slotId, 'countdown', { ...(obsPane ? { obsPane: true } : {}), text: formatCountdown(Math.max(0, computeCountdownRemainingMs(runtime, Date.now())), 'hh:mm:ss') })
}
