import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
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
    exclude: ['node_modules/**', 'dist/**', 'e2e/**', '.worktrees/**', '.stryker-tmp/**'],
    setupFiles: ['./vitest.setup.ts'],
    environmentOptions: {
      jsdom: {
        // Sem url o jsdom 25 desabilita localStorage/window.sessionStorage
        // (usados por browser-storage, i18n e toda persistência offline-first).
        url: 'http://localhost:5173',
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 100,
      },
      include: ['src/**/*.ts', 'src/**/*.vue'],
    },
  },
})
