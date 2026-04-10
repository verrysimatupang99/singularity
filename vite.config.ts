import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

// Native Node.js and Electron-specific modules that must NOT be bundled by Rollup.
// These are either native addons (.node binaries), or packages that rely on
// Node.js built-ins in ways that are incompatible with Vite's bundler.
const MAIN_EXTERNALS = [
  // Electron & Node built-ins
  'electron',
  'child_process',
  'fs',
  'path',
  'os',
  'crypto',
  'net',
  'http',
  'https',
  'events',
  'stream',
  'util',
  'url',
  'assert',
  'buffer',
  'process',
  'zlib',
  // === NATIVE ADDONS — must be external (have .node binaries that can't be bundled) ===
  'node-pty',
  '@nut-tree/nut-js',
  '@nut-tree-fork/nut-js',
  'keytar',
  'fsevents',
  // === CJS Electron ecosystem — no ESM exports ===
  'electron-updater',
  'electron-log',
  // === Packages with native/fs internals ===
  'extract-zip',
]

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
              external: MAIN_EXTERNALS,
            },
          },
        },
      },
      {
        entry: resolve(__dirname, 'src/preload/index.ts'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/preload'),
            lib: {
              entry: resolve(__dirname, 'src/preload/index.ts'),
              formats: ['cjs'],
            },
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  root: resolve(__dirname, 'src/renderer'),
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    // Suppress the 500KB warning — main.js will always be large due to Monaco + React
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
      },
      output: {
        // Code-split Monaco editor and other large vendor chunks
        manualChunks: (id) => {
          if (id.includes('node_modules/monaco-editor')) return 'monaco'
          if (id.includes('node_modules/@radix-ui')) return 'radix'
          if (id.includes('node_modules/lucide-react')) return 'icons'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
  clearScreen: false,
})
