import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: resolve(__dirname, 'src/main/index.ts'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/main'),
            rollupOptions: {
              external: ['electron', 'child_process', 'fs', 'path', 'os', 'crypto', 'net']
            }
          }
        }
      },
      {
        entry: resolve(__dirname, 'src/preload/index.ts'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/preload'),
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ]),
    electronRenderer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer')
    }
  },
  root: resolve(__dirname, 'src/renderer'),
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  },
  clearScreen: false
})
