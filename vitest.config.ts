import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  define: {
    // Paridade com vite.config: constante injetada a partir do package.json
    // (usada por @shared/constants/app — AppShell/AppTitlebar importam).
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
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
    setupFiles: ['src/test/localstorage-shim-setup.ts'],
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
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
