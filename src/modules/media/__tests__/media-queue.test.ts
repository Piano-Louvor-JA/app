import { describe, expect, it } from 'vitest'

import {
  appendToQueue,
  resolvePrevious,
  type QueueItem,
  removeFromQueue,
  reorderQueue,
  resolveNext,
  shuffleQueue,
  type UpcomingState,
} from '../services/media-queue'

const item = (musicId: number, title = `m${musicId}`): QueueItem => ({
  musicId,
  albumId: 1,
  title,
})

describe('media-queue — fila de reprodução (spec playlist RF-03)', () => {
  it('fila vazia: resolveNext devolve null (comportamento atual: parar no fim)', () => {
    expect(resolveNext({ items: [], index: -1 })).toBeNull()
  })

  it('avança sequencialmente', () => {
    const items = [item(1), item(2), item(3)]
    expect(resolveNext({ items, index: 0 })?.musicId).toBe(2)
    expect(resolveNext({ items, index: 1 })?.musicId).toBe(3)
  })

  it('última faixa: resolveNext devolve null (fim da fila, para)', () => {
    const items = [item(1), item(2)]
    expect(resolveNext({ items, index: 1 })).toBeNull()
  })

  it('append adiciona ao fim sem mexer na faixa atual', () => {
    const items = [item(1), item(2)]
    const next = appendToQueue(items, item(3), 0)
    expect(next.items.map((i) => i.musicId)).toEqual([1, 2, 3])
    expect(next.index).toBe(0)
  })

  it('append de faixa repetida consecutiva é ignorado (guard de duplo clique)', () => {
    const items = [item(1), item(2)]
    const next = appendToQueue(items, item(2), 0)
    expect(next.items).toHaveLength(2)
  })

  it('removeFromQueue ajusta o índice: remover antes da atual puxa o índice', () => {
    const items = [item(1), item(2), item(3)]
    // remove índice 0 (musicId 1); atual era índice 1 (musicId 2) → 0
    const next = removeFromQueue(items, 0, 1)
    expect(next.items.map((i) => i.musicId)).toEqual([2, 3])
    expect(next.index).toBe(0)
    expect(next.removedCurrent).toBe(false)
  })

  it('removeFromQueue da faixa atual devolve null (caller decide: pular ou parar)', () => {
    const items = [item(1), item(2)]
    // remove índice 1 = atual (musicId 2); sobra [1], índice inválido
    const next = removeFromQueue(items, 1, 1)
    expect(next.items.map((i) => i.musicId)).toEqual([1])
    expect(next.removedCurrent).toBe(true)
    expect(next.index).toBe(-1)
  })

  it('reordenar mantém a faixa atual apontada pelo musicId', () => {
    const items = [item(1), item(2), item(3)]
    const next = reorderQueue(items, 1, [3, 1, 2] as never, 0)
    // nova ordem por musicIds [3,1,2]; atual era musicId 1 → índice 1
    expect(next.items.map((i) => i.musicId)).toEqual([3, 1, 2])
    expect(next.items[next.index]?.musicId).toBe(1)
  })

  it('shuffle: mesma faixa atual, ordem do resto embaralhada e válida', () => {
    const items = Array.from({ length: 12 }, (_, i) => item(i + 1))
    const state: UpcomingState = { items, index: 4 }
    const next = shuffleQueue(state.items, state.index)
    expect(next.items[next.index]?.musicId).toBe(5)
    expect(next.items).toHaveLength(12)
    const restIds = next.items.filter((_, i) => i !== next.index).map((i) => i.musicId)
    expect(new Set(restIds).size).toBe(11)
    expect(restIds).not.toEqual(items.filter((_, i) => i !== 4).map((i) => i.musicId))
  })
})

const q = (id: number): QueueItem => ({ musicId: id, albumId: null, title: `T${id}` })

describe('gaps — resolvePrevious fora do range e removeFromQueue índice inválido', () => {
  it('resolvePrevious: index 0 -> null (prevIndex < 0)', () => {
    expect(resolvePrevious({ items: [q(1)], index: 0 })).toBeNull()
  })

  it('resolvePrevious: index além do fim -> null', () => {
    expect(resolvePrevious({ items: [q(1)], index: 5 })).toBeNull()
  })

  it('removeFromQueue: índice inválido -> no-op (L53)', () => {
    const items = [q(1), q(2)]
    const r = removeFromQueue(items, 5, 0)
    expect(r).toEqual({ items, index: 0, removedCurrent: false })
    const r2 = removeFromQueue(items, -1, 0)
    expect(r2.removedCurrent).toBe(false)
  })

  it('append duplicata consecutiva: retorna mesmos items (L28-30 já?)', () => {
    const items = [q(1), q(2)]
    const r = appendToQueue(items, q(2), 1)
    expect(r.items).toBe(items)
    expect(r.index).toBe(1)
  })
})
