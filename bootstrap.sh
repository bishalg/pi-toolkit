#!/usr/bin/env bash
set -euo pipefail

echo "==> 🧰 Initializing Pi Agent & pi-toolkit environment..."

# 1. Check or install Pi CLI
if ! command -v pi &> /dev/null; then
  echo "==> Installing @earendil-works/pi-coding-agent globally..."
  npm install -g --ignore-scripts @earendil-works/pi-coding-agent
else
  echo "==> Pi CLI detected: $(pi --version)"
fi

# 2. Install pi-toolkit package
echo "==> Installing pi-toolkit globally into Pi..."
pi install git:github.com/bishalg/pi-toolkit

# 3. Optional extensions
if [ "${1:-}" = "--with-providers" ]; then
  echo "==> Installing recommended provider packages..."
  pi install npm:pi-antigravity || true
fi

echo "==> ✅ Setup complete! Run 'pi list' to verify installed packages."
