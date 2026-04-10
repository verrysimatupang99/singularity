/**
 * Production runner:
 * 1. Build renderer, main, preload for production
 * 2. Launch Electron on production build
 */
import { spawn } from 'node:child_process'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Step 1: Build preload as CJS
console.log('[build] Building preload as CJS...')
await esbuild.build({
  entryPoints: [resolve(__dirname, 'src/preload/index.ts')],
  bundle: true,
  outfile: resolve(__dirname, 'dist/preload/index.cjs'),
  format: 'cjs',
  external: ['electron'],
  platform: 'node',
  minify: true,
})
console.log('[build] Preload ✓')

// Step 2: Build main process
console.log('[build] Building main process...')
await build({
  configFile: resolve(__dirname, 'vite.config.ts'),
  build: {
    outDir: resolve(__dirname, 'dist/main'),
    lib: {
      entry: resolve(__dirname, 'src/main/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'electron', 'child_process', 'fs', 'path', 'os', 'crypto', 'net',
        'http', 'https', 'events', 'stream', 'util', 'url', 'assert',
        'buffer', 'process', 'zlib', 'node-pty', '@nut-tree/nut-js',
        '@nut-tree-fork/nut-js', 'keytar', 'fsevents', 'electron-updater',
        'electron-log', 'extract-zip', 'openai', '@anthropic-ai/sdk',
      ],
    },
  },
})
console.log('[build] Main process ✓')

// Step 3: Build renderer
console.log('[build] Building renderer...')
await build({
  configFile: resolve(__dirname, 'vite.config.ts'),
})
console.log('[build] Renderer ✓')

// Step 4: Launch Electron
console.log('[run] Starting Electron (production build)...')
const electron = spawn('npx', ['electron', '.'], {
  stdio: 'inherit',
  env: { ...process.env },
})

electron.on('exit', (code) => {
  console.log(`[run] Electron exited with code ${code}`)
  process.exit(code ?? 0)
})
