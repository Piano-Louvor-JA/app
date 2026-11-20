import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Real Roku OS 16+ contract (developer.roku.com/docs/rowebsocketevent):
// roWebSocketEvent exposes GetType() as Int (1=Opened,2=Closed,3=Error,5=TextReceived)
// and GetInfo() as Object (TextReceived info carries .Text). There are NO
// isOpened()/isTextReceived()/isClosed()/isError()/GetString() predicates.
const EVENT_TYPE = { Opened: 1, Closed: 2, Error: 3, MsgSent: 4, TextReceived: 5, DataReceived: 6, PingReceived: 7, PongReceived: 8, Timer: 9 }

const source = fs.readFileSync(path.resolve('components/PalcoSocketTask.brs'), 'utf8')

test('socket task reads WS events via GetType() with documented type constants', () => {
  assert.match(source, /event\.GetType\(\)/)
  // BrightScript reserves `Error`, so the documented Error event (3) is aliased as ErrorType.
  // Only the events this task actually handles; Error is aliased (reserved word in BrightScript).
  const HANDLED = { Opened: 1, Closed: 2, Error: 3, TextReceived: 5 }
  const aliases = { ...HANDLED, Error: 'ErrorType' }
  for (const [name, value] of Object.entries(aliases)) {
    const identifier = typeof value === 'string' ? value : name
    assert.ok(
      new RegExp(`\\b${identifier}\\s*=\\s*${HANDLED[name]}\\b`).test(source),
      `missing documented event constant ${name}=${HANDLED[name]}`,
    )
  }
})

test('socket task has no nonexistent roWebSocketEvent predicates', () => {
  for (const phantom of ['isOpened(', 'isTextReceived(', 'isClosed(', 'isError(', 'GetString()']) {
    assert.ok(!source.includes(phantom), `phantom API ${phantom} is not part of roWebSocketEvent`)
  }
})

test('socket task extracts text payload from GetInfo().Text', () => {
  assert.match(source, /GetInfo\(\)/)
  assert.match(source, /\.Text\b/)
})
