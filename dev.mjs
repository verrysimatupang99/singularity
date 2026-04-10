/**
 * Robust dev startup:
 * 1. Build preload as CJS (esbuild, with watch)
 * 2. Start Vite dev server
 * 3. Launch Electron with VITE_DEV_SERVER_URL
 */
import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Build preload as CJS (with watch)
console.log('[dev] Building preload as CJS (watch mode)...')
const preloadCtx = await esbuild.context({
  entryPoints: [resolve(__dirname, 'src/preload/index.ts')],
  bundle: true,
  outfile: resolve(__dirname, 'dist/preload/index.cjs'),
  format: 'cjs',
  external: ['electron'],
  platform: 'node',
})
await preloadCtx.rebuild()
await preloadCtx.watch()
console.log('[dev] Preload built ✓ (watching for changes)')

// Start Vite dev server
console.log('[dev] Starting Vite dev server...')
const server = await createServer({
  configFile: resolve(__dirname, 'vite.config.ts'),
})
await server.listen()

const url = server.resolvedUrls?.local[0] || 'http://localhost:5173/'
console.log(`[dev] Vite running at ${url}`)

// Launch Electron
console.log('[dev] Starting Electron...')
const electron = spawn('npx', ['electron', '.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
})

electron.on('exit', (code) => {
  console.log(`[dev] Electron exited with code ${code}`)
  preloadCtx.dispose()
  server.close()
  process.exit(code ?? 0)
})

process.on('SIGINT', () => { electron.kill('SIGTERM'); preloadCtx.dispose(); server.close() })
process.on('SIGTERM', () => { electron.kill('SIGTERM'); preloadCtx.dispose(); server.close() })
