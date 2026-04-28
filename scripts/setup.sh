#!/usr/bin/env bash
# Install npm dependencies when they are missing (or when --force is passed).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAMP="node_modules/.translator-llm-setup-stamp"

# Quieter default output (skip funding tips and post-install audit report).
npm_install() {
  npm install --no-fund --no-audit --loglevel=warn "$@"
}

force=false
for arg in "$@"; do
  case "$arg" in
    --force | -f) force=true ;;
  esac
done

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found. Install Node.js (https://nodejs.org/) first." >&2
  exit 1
fi

if $force; then
  echo "Running npm install (--force)…"
  npm_install
  mkdir -p node_modules
  touch "$STAMP"
  exit 0
fi

if [[ ! -d node_modules ]]; then
  echo "Dependencies not present (no node_modules/). Running npm install…"
  npm_install
  touch "$STAMP"
  exit 0
fi

if [[ ! -f "$STAMP" ]]; then
  echo "No setup stamp — running npm install…"
  npm_install
  touch "$STAMP"
  exit 0
fi

need_install=false
if [[ -f package.json ]] && [[ package.json -nt "$STAMP" ]]; then
  need_install=true
fi
if [[ -f package-lock.json ]] && [[ package-lock.json -nt "$STAMP" ]]; then
  need_install=true
fi

if $need_install; then
  echo "package.json or package-lock.json changed since last setup. Running npm install…"
  npm_install
  touch "$STAMP"
  exit 0
fi

echo "Dependencies already present. Use: $0 --force   to reinstall."
