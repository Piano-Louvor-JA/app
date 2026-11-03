// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { onReceiverEvent, publishReceiverEvent } from '../palco/receiver-events.mjs'
it('forwards receiver-ready acknowledgements to controls and removes closed controls', () => {
  const controls = vi.fn()
  const off = onReceiverEvent(controls)
  const message = { v: 2, type: 'receiver-ready', requestId: 'youtube-7082', youtube: true }
  publishReceiverEvent(message)
  expect(controls).toHaveBeenCalledWith(message)
  off()
  publishReceiverEvent(message)
  expect(controls).toHaveBeenCalledTimes(1)
})
it('does not lose acknowledgements when another consumer is already closed', () => {
  const bad = onReceiverEvent(() => { throw new Error('closed') })
  const controls = vi.fn()
  const off = onReceiverEvent(controls)
  try {
    publishReceiverEvent({ type: 'receiver-ready' })
    expect(controls).toHaveBeenCalledTimes(1)
  } finally { bad(); off() }
})
