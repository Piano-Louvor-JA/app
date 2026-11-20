import { describe, expect, it } from 'vitest'
import { compileBlockEngine } from './network-blocking'

describe('compileBlockEngine', () => {
  const request = (url: string) => ({
    url,
    sourceUrl: 'https://reader.example/page',
    resourceType: 'script' as const,
  })

  it('ignores comments and blank lines, blocks matching substrings, and fails open without a match', () => {
    const engine = compileBlockEngine(['', '  ', '! authored fixture', 'advert'])

    expect(engine.decide(request('https://cdn.example/advert.js'))).toEqual({
      action: 'block',
      reason: 'network-rule',
      matchedRuleId: 'rule-1',
    })
    expect(engine.decide(request('https://cdn.example/app.js'))).toEqual({
      action: 'allow',
      reason: 'no-match',
    })
  })

  it('matches exact domains and subdomains without matching a suffix lookalike', () => {
    const engine = compileBlockEngine(['||ads.example^'])

    expect(engine.decide(request('https://ads.example/a.js')).action).toBe('block')
    expect(engine.decide(request('https://cdn.ads.example/a.js')).action).toBe('block')
    expect(engine.decide(request('https://notads.example/a.js'))).toEqual({
      action: 'allow',
      reason: 'no-match',
    })
  })

  it('lets a matching exception override a matching block but ignores a nonmatching exception', () => {
    const engine = compileBlockEngine(['advert', '@@safe-advert'])

    expect(engine.decide(request('https://cdn.example/safe-advert.js'))).toEqual({
      action: 'allow',
      reason: 'exception',
      matchedRuleId: 'rule-2',
    })
    expect(engine.decide(request('https://cdn.example/advert.js'))).toEqual({
      action: 'block',
      reason: 'network-rule',
      matchedRuleId: 'rule-1',
    })
  })

  it('rejects invalid rules and untrusted request boundaries with typed errors', () => {
    expect(() => compileBlockEngine(['||ads.example'])).toThrow(/line 1.*domain-rule/)

    const engine = compileBlockEngine(['advert'])
    expect(() => engine.decide({ ...request('ftp://cdn.example/advert.js') })).toThrow(/InvalidRequestError/)
    expect(() => engine.decide({ ...request('https://cdn.example/advert.js'), resourceType: 'video' as never })).toThrow(/InvalidRequestError/)
  })

  it('keeps compiled engines immutable and deterministic across 100 decisions', () => {
    const oldEngine = compileBlockEngine(['advert'])
    const newEngine = compileBlockEngine(['tracker'])
    const input = request('https://cdn.example/advert.js')
    const expected = oldEngine.decide(input)

    expect(newEngine.decide(input)).toEqual({ action: 'allow', reason: 'no-match' })
    for (let run = 0; run < 100; run += 1) expect(oldEngine.decide(input)).toEqual(expected)
  })
})
