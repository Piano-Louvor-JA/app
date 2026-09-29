import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // __APP_VERSION__ é injetado pelo build (vite.config do app) — em teste usamos a versão do package.json
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(require('node:fs').readFileSync('./package.json', 'utf-8')).version,
    ),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@app': path.resolve(__dirname, './src/app'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@design-system': path.resolve(__dirname, './src/design-system'),
      '@layouts': path.resolve(__dirname, './src/layouts'),
      '@plugins': path.resolve(__dirname, './src/plugins'),
      '@themes': path.resolve(__dirname, './src/design-system/themes'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@locales': path.resolve(__dirname, './src/locales'),
    },
  },
  test: {
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
    setupFiles: ['./vitest.setup.ts'],
    // Runs completos com coverage (istanbul) estouram 5s em testes que
    // mockam bridge/processamento pesado — transform 125s no run global.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      thresholds: {
        lines: 75,
        functions: 70,
        statements: 75,
        branches: 70,
      },
      include: [
        'src/**/*.ts',
        'src/**/*.vue',
      ],
      exclude: [
        '**/__tests__/**',
        'src/**/locales/*.ts',
        'src/**/*.d.ts',
      ],
    },
  },
})
