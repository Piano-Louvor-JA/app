import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  RANDOM_ANIMATION_PROFILES,
  RANDOM_MAX_RANGE_SIZE,
} from '../types/random'
import {
  buildNumberRange,
  mergeUniqueNames,
  parseNameListFromText,
  pickRandomItem,
  remainingCandidates,
  runDrawAnimation,
} from '../services/random-draw'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('random-draw — pickRandomItem', () => {
  it('lista vazia retorna null', () => {
    expect(pickRandomItem([])).toBeNull()
  })

  it('índice 0 com Math.random mockado pega o primeiro', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(pickRandomItem(['a', 'b', 'c'])).toBe('a')
  })

  it('índice máximo (length-1) com random ~1 pega o último', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    expect(pickRandomItem(['a', 'b', 'c'])).toBe('c')
  })

  it('item do meio com random 0.5', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(pickRandomItem(['a', 'b', 'c'])).toBe('b')
  })

  it('random = 1 (mock) estoura o índice → fallback null', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)
    expect(pickRandomItem(['a', 'b'])).toBeNull()
  })
})

describe('random-draw — parseNameListFromText', () => {
  it('quebra por linha e remove vazios', () => {
    expect(parseNameListFromText('ana\n\n  \njoão')).toEqual(['ana', 'joão'])
  })

  it('trim + dedupe exato', () => {
    expect(parseNameListFromText('ana\n ana \nana\njoão')).toEqual(['ana', 'joão'])
  })

  it('normaliza NFC: José decomposto e composto viram um só', () => {
    const decomposto = 'Jose\u0301' // e + combining acute
    const composto = 'José'
    expect(parseNameListFromText(`${decomposto}\n${composto}`)).toEqual(['José'])
  })

  it('aceita CRLF', () => {
    expect(parseNameListFromText('a\r\nb\r\nc')).toEqual(['a', 'b', 'c'])
  })
})

describe('random-draw — mergeUniqueNames', () => {
  it('adiciona só os novos e conta adicionados', () => {
    const { next, addedCount } = mergeUniqueNames(['ana'], ['joão', 'ana', '  joão '])
    expect(next).toEqual(['ana', 'joão'])
    expect(addedCount).toBe(1)
  })

  it('ignora vazio e duplicata NFC', () => {
    const { next, addedCount } = mergeUniqueNames([], ['   ', 'Jose\u0301', 'José'])
    expect(next).toEqual(['José'])
    expect(addedCount).toBe(1)
  })

  it('não muta o array original', () => {
    const existing = ['a']
    mergeUniqueNames(existing, ['b'])
    expect(existing).toEqual(['a'])
  })
})

describe('random-draw — buildNumberRange', () => {
  it('intervalo válido gera strings inclusive', () => {
    expect(buildNumberRange(3, 5)).toEqual({ ok: true, values: ['3', '4', '5'] })
  })

  it('inválido: min >= max, NaN e infinitos', () => {
    expect(buildNumberRange(5, 5)).toEqual({ ok: false, reason: 'invalid' })
    expect(buildNumberRange(6, 5)).toEqual({ ok: false, reason: 'invalid' })
    expect(buildNumberRange(NaN, 5)).toEqual({ ok: false, reason: 'invalid' })
    expect(buildNumberRange(1, Infinity)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('trunca decimais', () => {
    expect(buildNumberRange(1.9, 3.1)).toEqual({ ok: true, values: ['1', '2', '3'] })
  })

  it('muito grande (> RANDOM_MAX_RANGE_SIZE) → tooLarge', () => {
    expect(buildNumberRange(0, RANDOM_MAX_RANGE_SIZE + 1)).toEqual({
      ok: false,
      reason: 'tooLarge',
    })
    // limite exato passa
    expect(buildNumberRange(0, RANDOM_MAX_RANGE_SIZE).ok).toBe(true)
  })
})

describe('random-draw — remainingCandidates', () => {
  it('remove os já sorteados', () => {
    expect(remainingCandidates(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
  })

  it('sem sorteados retorna tudo', () => {
    expect(remainingCandidates(['a'], [])).toEqual(['a'])
  })
})

describe('random-draw — runDrawAnimation', () => {
  it('percorre maxTicks com onTick e finaliza com onFinish', () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const ticks: string[] = []
    let winner: string | null = null
    const profile = RANDOM_ANIMATION_PROFILES.fast

    const cancel = runDrawAnimation(['ana', 'joão'], 'fast', {
      onTick: (c) => ticks.push(c),
      onFinish: (w) => {
        winner = w
      },
    })

    // adianta o suficiente para todos os ticks (intervalo cresce no slowdown,
    // então adiantamos o tempo em blocos generosos)
    for (let i = 0; i < profile.maxTicks + 2; i++) {
      vi.advanceTimersByTime(30 + i * 25)
    }

    expect(ticks).toHaveLength(profile.maxTicks)
    expect(winner).not.toBeNull()
    cancel()
    vi.useRealTimers()
  })

  it('cancel() interrompe a animação (nenhum onFinish)', () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    let finished = false
    const cancel = runDrawAnimation(['x'], 'slow', {
      onTick: () => {},
      onFinish: () => {
        finished = true
      },
    })

    vi.advanceTimersByTime(100)
    cancel()
    cancel() // idempotente

    vi.advanceTimersByTime(600_000)
    expect(finished).toBe(false)
    vi.useRealTimers()
  })

  it('pool vazio: nenhum tick nem finish', () => {
    vi.useFakeTimers()
    let ticked = false
    let finished = false
    runDrawAnimation([], 'fast', {
      onTick: () => {
        ticked = true
      },
      onFinish: () => {
        finished = true
      },
    })
    vi.advanceTimersByTime(600_000)
    expect(ticked).toBe(false)
    expect(finished).toBe(false)
    vi.useRealTimers()
  })

  it('candidato/winner null (random=1 estoura índice) não chamam callbacks', () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(1)

    let ticks = 0
    let finished = false
    const profile = RANDOM_ANIMATION_PROFILES.fast
    const cancel = runDrawAnimation(['único'], 'fast', {
      onTick: () => ticks++,
      onFinish: () => {
        finished = true
      },
    })

    for (let i = 0; i < profile.maxTicks + 2; i++) {
      vi.advanceTimersByTime(30 + i * 25)
    }

    // onTick/onFinish nunca disparados: pickRandomItem sempre null
    expect(ticks).toBe(0)
    expect(finished).toBe(false)
    cancel()
    vi.useRealTimers()
  })
})
