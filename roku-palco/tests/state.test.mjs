import test from 'node:test'
import assert from 'node:assert/strict'
import { reduceState, initialState } from './state-harness.mjs'

test('projection and background update state as plain text', () => {
  let state = initialState()
  state = reduceState(state, { type: 'bgPalco', url: 'http://host/bg.jpg?token=x' })
  state = reduceState(state, { type: 'projection', text: '<b>Jesus</b>', footer: 'Ap 4:8' })
  assert.equal(state.mode, 'projection')
  assert.equal(state.projection.text, '<b>Jesus</b>')
  assert.equal(state.projection.footer, 'Ap 4:8')
  assert.equal(state.backgroundUrl, 'http://host/bg.jpg?token=x')
})

test('timer and diagnostic payloads update predictable state', () => {
  let state = reduceState(initialState(), { type: 'timer', action: 'start', duration: 30_000, label: 'Início' })
  assert.equal(state.mode, 'timer')
  assert.equal(state.timer.visible, true)
  state = reduceState(state, { type: 'youare', ip: '192.168.1.8', slot: 2, slotLabel: 'TV 3' })
  assert.equal(state.connection.slotLabel, 'TV 3')
})

test('idle and connection loss stop both media channels immediately', () => {
  let state = reduceState(initialState(), { type: 'audio', action: 'play', url: 'http://host/a.mp3' })
  state = reduceState(state, { type: 'video', action: 'play', url: 'http://host/v.mp4' })
  state = reduceState(state, { type: 'connectionLost' })
  assert.equal(state.mode, 'idle')
  assert.equal(state.audio.action, 'stop')
  assert.equal(state.video.action, 'stop')
  assert.equal(state.connected, false)
})
