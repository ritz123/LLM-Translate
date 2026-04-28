#!/usr/bin/env bash
# Easy entry: ./run.sh | ./run.sh dev | ./run.sh desktop | ./run.sh build | ./run.sh setup
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage: ./run.sh [command] [args...]

Commands:
  dev       Start development (default): Electron + Vite hot reload
  desktop   Build production assets, then open the desktop app
  build     Typecheck, Vite build, and bundle the Electron main process
  setup     Install npm dependencies only (pass --force to reinstall)
  help      Show this message

Examples:
  ./run.sh
  ./run.sh dev
  ./run.sh desktop
  ./run.sh setup --force
EOF
}

if [[ $# -ge 1 ]]; then
  CMD="$1"
  shift
else
  CMD="dev"
fi

case "$CMD" in
  -h | --help | help)
    usage
    exit 0
    ;;
  dev)
    "$ROOT/scripts/setup.sh" 2>&1 | tee setup.log
    echo "→ npm run dev (Electron + Vite)"
    exec npm run dev 2>&1 | tee dev.log
    ;;
  desktop)
    "$ROOT/scripts/setup.sh" 2>&1 | tee setup.log
    echo "→ npm run desktop (build + Electron)"
    exec npm run desktop 2>&1 | tee desktop.log
    ;;
  build)
    "$ROOT/scripts/setup.sh" 2>&1 | tee setup.log 
    echo "→ npm run build"
    exec npm run build 2>&1 | tee build.log
    ;;
  setup)
    exec "$ROOT/scripts/setup.sh" "$@" 2>&1 | tee setup.log
    ;;
  *)
    echo "Unknown command: $CMD" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac
