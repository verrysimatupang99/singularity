#!/bin/bash
set -e

cd ~/Documents/Coding/singularity

echo "=== Killing old Electron ==="
pkill -f electron 2>/dev/null || true
sleep 1

echo "=== Building ==="
rm -rf dist/
npm run build
npx esbuild src/preload/index.ts --bundle --outfile=dist/preload/index.cjs --format=cjs --external:electron --platform=node --minify

echo "=== Launching Singularity ==="
SINGULARITY_NO_UPDATER=1 npx electron . \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --disable-gpu-compositing
