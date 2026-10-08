import { defineConfig } from 'orval'

/**
 * app#340 — client gerado da API Piano a partir do /openapi.json.
 *
 * Fonte: staging em dev (mesma API que o app aponta). Regenerar:
 *   npm run orval
 * Commitar o output (revisável em PR — sem geração implícita no build).
 * Módulo piloto: auth/custom (consumido pelo sync v2 #336).
 */
export default defineConfig({
  piano: {
    input: {
      target: './openapi.json',
    },
    output: {
      target: './src/shared/api-generated/piano.ts',
      schemas: './src/shared/api-generated/model',
      client: 'fetch',
      mode: 'tags-split',
      mock: false,
      clean: true,
      prettier: false,
      override: {
        query: {
          useQuery: true,
        },
      },
    },
  },
})
