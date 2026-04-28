#!/usr/bin/env bash
# Easy entry: ./run.sh | dev | desktop | build | dist | release | setup
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
  dist      Build installers for this OS into ./release/ (Linux: AppImage + tar.gz; Windows: NSIS + portable). Full matrix on GitHub tag.
  release   Prepare a version tag for GitHub (see scripts/release.sh); pass semver, e.g. 0.2.0
  setup     Install npm dependencies only (pass --force to reinstall)
  help      Show this message

Examples:
  ./run.sh
  ./run.sh dev
  ./run.sh desktop
  ./run.sh dist
  ./run.sh release 0.2.0
  ./run.sh setup --force
EOF
}

if [[ $# -ge 1 ]]; then
  CMD="$1"
  shift
else
  CMD="desktop"
fi

case "$CMD" in
  -h | --help | help)
    usage
    exit 0
    ;;
  dev)
    "$ROOT/scripts/setup.sh" 2>&1 > setup.log
    exec npm run dev 2>&1 | tee dev.log
    ;;
  desktop)
    "$ROOT/scripts/setup.sh" 2>&1 > setup.log
    exec npm run desktop 2>&1 > desktop.log
    ;;
  build)
    "$ROOT/scripts/setup.sh" 2>&1 > setup.log 
    exec npm run build 2>&1 > build.log
    ;;
  dist)
    "$ROOT/scripts/setup.sh" 2>&1 > setup.log
    exec npm run dist 2>&1 > dist.log
    ;;
  release)
    exec "$ROOT/scripts/release.sh" "$@"
    ;;
  setup)
    exec "$ROOT/scripts/setup.sh" "$@" 2>&1 > setup.log
    ;;
  *)
    echo "Unknown command: $CMD" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac
