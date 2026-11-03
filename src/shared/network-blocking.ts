export type ResourceType = 'document' | 'script' | 'image' | 'stylesheet' | 'xhr' | 'other'

export type Request = {
  url: string
  sourceUrl: string
  resourceType: ResourceType
}

export type Decision = {
  action: 'allow' | 'block'
  matchedRuleId?: string
  reason: 'exception' | 'network-rule' | 'no-match'
}

type Rule = {
  id: string
  kind: 'block' | 'exception'
  matches: (url: URL) => boolean
}

export class RuleCompilationError extends Error {
  constructor(line: number, category: string) {
    super(`RuleCompilationError: line ${line}: ${category}`)
    this.name = 'RuleCompilationError'
  }
}

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(`InvalidRequestError: ${message}`)
    this.name = 'InvalidRequestError'
  }
}

export interface BlockEngine {
  decide(request: Request): Decision
}

const resourceTypes = new Set<ResourceType>(['document', 'script', 'image', 'stylesheet', 'xhr', 'other'])
const domainRule = /^\|\|([a-z0-9.-]+)\^$/i

function parseHttpUrl(value: string, field: 'url' | 'sourceUrl'): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new InvalidRequestError(`${field} must be an absolute HTTP(S) URL`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidRequestError(`${field} must use HTTP(S)`)
  }
  return parsed
}

function compileRule(text: string, id: string, line: number): Rule {
  const kind = text.startsWith('@@') ? 'exception' : 'block'
  const pattern = kind === 'exception' ? text.slice(2) : text
  if (!pattern) throw new RuleCompilationError(line, 'empty-rule')

  const domain = domainRule.exec(pattern)
  if (pattern.startsWith('||') && !domain) throw new RuleCompilationError(line, 'domain-rule')

  const matches = domain
    ? (url: URL) => {
        const host = url.hostname.toLowerCase()
        const expected = domain[1]!.toLowerCase()
        return host === expected || host.endsWith(`.${expected}`)
      }
    : (url: URL) => url.href.includes(pattern)

  return { id, kind, matches }
}

export function compileBlockEngine(lines: readonly string[]): BlockEngine {
  let ruleCount = 0
  const rules = lines.flatMap((raw, index) => {
    const text = raw.trim()
    if (!text || text.startsWith('!')) return []
    ruleCount += 1
    return [compileRule(text, `rule-${ruleCount}`, index + 1)]
  })

  return {
    decide(request: Request): Decision {
      const url = parseHttpUrl(request.url, 'url')
      parseHttpUrl(request.sourceUrl, 'sourceUrl')
      if (!resourceTypes.has(request.resourceType)) throw new InvalidRequestError('resourceType is unsupported')

      const exception = rules.find((rule) => rule.kind === 'exception' && rule.matches(url))
      if (exception) return { action: 'allow', reason: 'exception', matchedRuleId: exception.id }

      const blocking = rules.find((rule) => rule.kind === 'block' && rule.matches(url))
      if (blocking) return { action: 'block', reason: 'network-rule', matchedRuleId: blocking.id }

      return { action: 'allow', reason: 'no-match' }
    },
  }
}
