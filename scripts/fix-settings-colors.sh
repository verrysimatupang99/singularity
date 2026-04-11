#!/bin/bash
# Replace hardcoded colors with CSS variable references in SettingsView.tsx

FILE="src/renderer/components/SettingsView.tsx"

# Surface colors
sed -i "s/'#0d0e0f'/'var(--surface-lowest)'/g" "$FILE"
sed -i "s/'#121314'/'var(--surface)'/g" "$FILE"
sed -i "s/'#1b1c1d'/'var(--surface-low)'/g" "$FILE"
sed -i "s/'#1f2021'/'var(--surface-container)'/g" "$FILE"
sed -i "s/'#292a2b'/'var(--surface-container-high)'/g" "$FILE"
sed -i "s/'#343536'/'var(--surface-container-highest)'/g" "$FILE"

# Common dark mode colors (GitHub dark)
sed -i "s/'#0d1117'/'var(--surface-lowest)'/g" "$FILE"
sed -i "s/'#161b22'/'var(--surface-container)'/g" "$FILE"
sed -i "s/'#21262d'/'var(--surface-container-high)'/g" "$FILE"
sed -i "s/'#30363d'/'var(--outline-variant)'/g" "$FILE"
sed -i "s/'#484f58'/'var(--on-surface-variant)'/g" "$FILE"
sed -i "s/'#8b949e'/'var(--on-surface-variant)'/g" "$FILE"
sed -i "s/'#6e7681'/'var(--on-surface-variant)'/g" "$FILE"
sed -i "s/'#c9d1d9'/'var(--on-surface)'/g" "$FILE"
sed -i "s/'#f0f6fc'/'var(--on-surface)'/g" "$FILE"
sed -i "s/'#d2a8ff'/'var(--on-surface)'/g" "$FILE"

# White
sed -i "s/'#fff'/'var(--on-surface)'/g" "$FILE"
sed -i "s/'#ffffff'/'var(--on-surface)'/g" "$FILE"

# Status colors
sed -i "s/'#3fb950'/'var(--success)'/g" "$FILE"
sed -i "s/'#238636'/'var(--success)'/g" "$FILE"
sed -i "s/'#2ea043'/'var(--success)'/g" "$FILE"
sed -i "s/'#f85149'/'var(--error)'/g" "$FILE"
sed -i "s/'#d29922'/'var(--warning)'/g" "$FILE"
sed -i "s/'#58a6ff'/'var(--info)'/g" "$FILE"

# Provider colors (keep these as-is, they're identity colors)
# anthropic: #d46f2f, openai: #10a37f, gemini: #4285f4, copilot: #24292e
# openrouter: #3b82f6, qwen: #615ef0, ollama: #000000
# e94560 is a custom red (keep), 72d6de is primary (keep as reference)

echo "Done replacing colors in $FILE"
