# Cara Menjalankan Singularity

## Quick Start

Copy semua baris di bawah ke terminal baru:

```bash
cd ~/Documents/Coding/singularity
pkill -f electron 2>/dev/null
rm -rf dist/
npm run build
npx esbuild src/preload/index.ts --bundle --outfile=dist/preload/index.cjs --format=cjs --external:electron --platform=node --minify
SINGULARITY_NO_UPDATER=1 npx electron . --no-sandbox --disable-gpu --disable-dev-shm-usage --disable-gpu-compositing
```

## Atau Pakai Script

```bash
cd ~/Documents/Coding/singularity
./run.sh
```

## Troubleshooting

**Blank screen?**
```bash
npx esbuild src/preload/index.ts --bundle --outfile=dist/preload/index.cjs --format=cjs --external:electron --platform=node --minify
SINGULARITY_NO_UPDATER=1 npx electron . --no-sandbox --disable-gpu --disable-dev-shm-usage --disable-gpu-compositing
```

**Masih error?**
```bash
SINGULARITY_NO_UPDATER=1 npx electron . --no-sandbox --disable-gpu --disable-dev-shm-usage --disable-gpu-compositing --in-process-gpu
```
