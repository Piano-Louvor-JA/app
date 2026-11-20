// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createRemoteToken, loadOrCreateRemoteTokens, saveRemoteTokens } from '../remote-tokens.mjs'

let dir
let file
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'piano-remote-tokens-'))
  file = path.join(dir, 'config', 'remote-tokens.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

it('gera dois tokens distintos e preserva ambos após reiniciar/reler', () => {
  const first = loadOrCreateRemoteTokens(file)
  expect(first.token).toMatch(/^[A-F0-9]{8}$/)
  expect(first.speakerToken).toMatch(/^[A-F0-9]{8}$/)
  expect(first.token).not.toBe(first.speakerToken)
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(first)
  expect(loadOrCreateRemoteTokens(file)).toEqual(first)
})

it('renova apenas o papel escolhido e persiste para a próxima abertura', () => {
  const first = loadOrCreateRemoteTokens(file)
  const next = { ...first, speakerToken: createRemoteToken([first.token, first.speakerToken]) }
  saveRemoteTokens(file, next)
  expect(next.speakerToken).not.toBe(first.speakerToken)
  expect(loadOrCreateRemoteTokens(file)).toEqual(next)
  expect(next.token).toBe(first.token)
})

it('repara token inválido ou duplicado sem trocar o outro token válido', () => {
  loadOrCreateRemoteTokens(file)
  writeFileSync(file, JSON.stringify({ token: 'AABBCCDD', speakerToken: 'AABBCCDD' }))
  const next = loadOrCreateRemoteTokens(file)
  expect(next.token).toBe('AABBCCDD')
  expect(next.speakerToken).not.toBe(next.token)
  expect(loadOrCreateRemoteTokens(file)).toEqual(next)
})

it('recupera arquivo corrompido e rejeita escrita inválida sem perder os dados', () => {
  loadOrCreateRemoteTokens(file)
  writeFileSync(file, '{quebrado')
  const recovered = loadOrCreateRemoteTokens(file)
  expect(recovered.token).not.toBe(recovered.speakerToken)
  expect(() => saveRemoteTokens(file, { token: 'INVALID', speakerToken: recovered.speakerToken })).toThrow()
  expect(loadOrCreateRemoteTokens(file)).toEqual(recovered)
})
