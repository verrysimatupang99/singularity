import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/test/**/*.test.ts'],
    exclude: ['opencode/**', 'zed/**', 'stitch/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      electron: resolve(__dirname, 'src/test/mocks/electron.ts'),
    },
  },
})
