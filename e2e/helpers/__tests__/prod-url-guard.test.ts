import { describe, expect, test } from 'vitest'
import {
  APP_API_ENV_KEYS,
  assertNoProdApiUrl,
  parseDotenv,
  PROD_HOSTS,
  readDotenvLayer,
  resolveEffectiveApiUrls,
  splitCsvUrls,
} from '../prod-url-guard'

// G2 — teste unitário do guard de URL de produção + parser de .env (critério
// A4 da SPEC guardrail-e2e). Produção → throw; staging/localhost/upstream →
// passa; .env.local sobrepõe .env; process.env sobrepõe tudo.

describe('PROD_HOSTS / APP_API_ENV_KEYS', () => {
  test('contém exatamente o host de produção da piano-api', () => {
    expect(PROD_HOSTS).toEqual(['api.pianolouvorja.com.br'])
  })

  test('cobre as 4 envs de API do app + é readonly', () => {
    expect(APP_API_ENV_KEYS).toEqual([
      'VITE_URL_DATABASE',
      'VITE_URL_FILES',
      'VITE_PALCO_API_URL',
      'PIANO_API_BASE_URL',
    ])
  })
})

describe('assertNoProdApiUrl', () => {
  test('lança para URL de produção com host e fonte na mensagem', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api.pianolouvorja.com.br/json_db'], 'process.env'),
    ).toThrowError(/^E2E apontando para PRODUÇÃO \(api\.pianolouvorja\.com\.br em process\.env\)/)
  })

  test('hostname é comparado case-insensitive', () => {
    expect(() =>
      assertNoProdApiUrl(['https://API.PianoLouvorJA.com.br'], 'process.env'),
    ).toThrowError(/^E2E apontando para PRODUÇÃO \(api\.pianolouvorja\.com\.br em process\.env\) — /)
  })

  test('lança para URL de produção com porta', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api.pianolouvorja.com.br:8443/v1'], '.env'),
    ).toThrowError(/com\.br:8443/)
  })

  test('aceita localhost com porta', () => {
    expect(() => assertNoProdApiUrl(['http://localhost:5174'], 'process.env')).not.toThrow()
  })

  test('aceita 127.0.0.1 com porta', () => {
    expect(() => assertNoProdApiUrl(['http://127.0.0.1:3100'], 'process.env')).not.toThrow()
  })

  test('aceita staging', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api-stg.pianolouvorja.com.br'], 'process.env'),
    ).not.toThrow()
  })

  test('aceita upstream read-only (api.louvorja.com.br)', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api.louvorja.com.br/json_db'], 'process.env'),
    ).not.toThrow()
  })

  test('pula entradas vazias, ausentes e URLs inválidas', () => {
    expect(() => assertNoProdApiUrl(['', undefined, '   ', 'not-a-url'], 'process.env')).not.toThrow()
  })

  test('CSV de fallbacks com UMA entrada de produção lança apontando a entrada', () => {
    expect(() =>
      assertNoProdApiUrl(
        splitCsvUrls('https://api.louvorja.com.br,https://api.pianolouvorja.com.br'),
        'process.env',
      ),
    ).toThrowError(/URL ofensora: https:\/\/api\.pianolouvorja\.com\.br$/)
  })

  test('subdomínio diferente NÃO é bloqueado (comparação de hostname exato)', () => {
    expect(() =>
      assertNoProdApiUrl(['https://api-stg.pianolouvorja.com.br', 'https://evil-api.pianolouvorja.com.br.attacker.io'], 'process.env'),
    ).not.toThrow()
  })

  test('URL com userinfo não burla o hostname', () => {
    expect(() =>
      assertNoProdApiUrl(['https://user@api.pianolouvorja.com.br'], '.env.local'),
    ).toThrowError(/em \.env\.local/)
  })
})

describe('splitCsvUrls', () => {
  test('quebra CSV, remove espaços e entradas vazias', () => {
    expect(splitCsvUrls(' https://a.example , ,https://b.example,')).toEqual([
      'https://a.example',
      'https://b.example',
    ])
  })

  test('undefined/vazio retorna lista vazia', () => {
    expect(splitCsvUrls(undefined)).toEqual([])
    expect(splitCsvUrls('')).toEqual([])
  })
})

describe('parseDotenv', () => {
  test('parseia KEY=VALUE, pula comentários e linhas inválidas', () => {
    expect(
      parseDotenv([
        '# comentário',
        'VITE_URL_DATABASE=https://api-stg.pianolouvorja.com.br/json_db',
        '',
        'sem-sinal-de-igual',
        '=chave-vazia',
        'VITE_API_TOKEN=abc123',
      ].join('\n')),
    ).toEqual({
      VITE_URL_DATABASE: 'https://api-stg.pianolouvorja.com.br/json_db',
      VITE_API_TOKEN: 'abc123',
    })
  })

  test('remove aspas simples e duplas do valor', () => {
    expect(parseDotenv('A="https://x.example"\nB=\'http://y.example\'')).toEqual({
      A: 'https://x.example',
      B: 'http://y.example',
    })
  })

  test('valor inline com # NÃO é tratado como comentário', () => {
    expect(parseDotenv('TOKEN=abc#não-comentário')).toEqual({ TOKEN: 'abc#não-comentário' })
  })

  test('CRLF é tolerado', () => {
    expect(parseDotenv('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' })
  })
})

describe('readDotenvLayer', () => {
  test('arquivo ausente vira camada vazia', () => {
    const layer = readDotenvLayer('/tmp/definitivamente-nao-existe-9182736.env', 'inexistente')
    expect(layer).toEqual({ source: 'inexistente', vars: {} })
  })
})

describe('resolveEffectiveApiUrls', () => {
  test('uma URL por env de API, com a origem de cada valor', () => {
    const resolved = resolveEffectiveApiUrls(
      {},
      [
        { source: '.env', vars: { VITE_URL_DATABASE: 'https://api-stg.pianolouvorja.com.br/json_db', VITE_PALCO_API_URL: 'https://api.louvorja.com.br' } },
        { source: '.env.local', vars: { PIANO_API_BASE_URL: 'http://localhost:3100' } },
      ],
    )
    expect(resolved).toEqual([
      { key: 'VITE_URL_DATABASE', url: 'https://api-stg.pianolouvorja.com.br/json_db', source: '.env' },
      { key: 'VITE_PALCO_API_URL', url: 'https://api.louvorja.com.br', source: '.env' },
      { key: 'PIANO_API_BASE_URL', url: 'http://localhost:3100', source: '.env.local' },
    ])
  })

  test('.env.local SOBREPÕE .env (mesma precedência do Vite)', () => {
    const resolved = resolveEffectiveApiUrls(
      {},
      [
        { source: '.env', vars: { VITE_PALCO_API_URL: 'https://api.pianolouvorja.com.br' } },
        { source: '.env.local', vars: { VITE_PALCO_API_URL: 'https://api-stg.pianolouvorja.com.br' } },
      ],
    )
    expect(resolved).toEqual([
      { key: 'VITE_PALCO_API_URL', url: 'https://api-stg.pianolouvorja.com.br', source: '.env.local' },
    ])
  })

  test('process.env SOBREPÕE arquivos e ganha o rótulo "process.env"', () => {
    const resolved = resolveEffectiveApiUrls(
      { PIANO_API_BASE_URL: 'http://localhost:3100' },
      [{ source: '.env', vars: { PIANO_API_BASE_URL: 'https://api.pianolouvorja.com.br' } }],
    )
    expect(resolved).toEqual([
      { key: 'PIANO_API_BASE_URL', url: 'http://localhost:3100', source: 'process.env' },
    ])
  })

  test('overlay que DEIXA de apontar produção é o escape correto (.env.local de staging)', () => {
    // Cenário do incidente: .env com produção + .env.local com staging → passa.
    const resolved = resolveEffectiveApiUrls(
      {},
      [
        { source: '.env', vars: { VITE_URL_DATABASE: 'https://api.pianolouvorja.com.br/json_db', VITE_URL_FILES: 'https://api.pianolouvorja.com.br/file', VITE_PALCO_API_URL: 'https://api.pianolouvorja.com.br', PIANO_API_BASE_URL: 'https://api.pianolouvorja.com.br' } },
        { source: '.env.local', vars: { VITE_URL_DATABASE: 'https://api-stg.pianolouvorja.com.br/json_db', VITE_URL_FILES: 'https://api-stg.pianolouvorja.com.br/file', VITE_PALCO_API_URL: 'https://api-stg.pianolouvorja.com.br', PIANO_API_BASE_URL: 'https://api-stg.pianolouvorja.com.br' } },
      ],
    )
    const hosts = resolved.map((r) => new URL(r.url).hostname)
    expect(hosts.every((h) => h === 'api-stg.pianolouvorja.com.br')).toBe(true)
  })

  test('fallback CSV expande em entradas individuais', () => {
    const resolved = resolveEffectiveApiUrls(
      { VITE_API_FALLBACK_URLS: 'https://api.louvorja.com.br, http://localhost:3100' },
      [],
    )
    expect(resolved).toEqual([
      { key: 'VITE_API_FALLBACK_URLS', url: 'https://api.louvorja.com.br', source: 'process.env' },
      { key: 'VITE_API_FALLBACK_URLS', url: 'http://localhost:3100', source: 'process.env' },
    ])
  })

  test('nenhuma env definida → lista vazia (web-style, sem API)', () => {
    expect(resolveEffectiveApiUrls({}, [])).toEqual([])
  })

  test('envs vazias ("" ) são puladas', () => {
    const resolved = resolveEffectiveApiUrls({ VITE_PALCO_API_URL: '' }, [
      { source: '.env', vars: { VITE_PALCO_API_URL: '' } },
    ])
    expect(resolved).toEqual([])
  })
})
