# Cliente de API gerado (orval)

O client da API Piano é **gerado** a partir do `/openapi.json` — não escrever
clients hand-rolled para endpoints que já existem aqui.

## Regenerar

```bash
# 1. Atualizar o contrato (staging em dev)
curl -s https://api-stg.pianolouvorja.com.br/openapi.json -o openapi.json

# 2. Regenerar
npm run orval
```

Commitar o output (`src/shared/api-generated/`) — é revisável em PR.

## Config

`orval.config.ts` — `client: fetch`, `mode: tags-split`, output em
`src/shared/api-generated/`. Módulo piloto: `custom` (auth/coletâneas —
consumido pelo sync v2, issue #336).
