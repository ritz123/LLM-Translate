#!/usr/bin/env bash
# Bump version, commit, and create an annotated tag for GitHub Releases.
# After pushing the tag, .github/workflows/release.yml builds Linux + Windows
# artifacts and attaches them to the release.
set -euo pipefail

usage() {
  echo "Usage: $(basename "$0") <semver>"
  echo "  Example: $(basename "$0") 0.2.0"
  echo ""
  echo "Updates package.json / package-lock.json, commits, and tags v<semver>."
  echo "Then push branch and tag so GitHub Actions can publish installers:"
  echo '  git push origin "$(git branch --show-current)" && git push origin "v<semver>"'
  exit 1
}

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  usage
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree or index is dirty. Commit or stash changes first." >&2
  exit 1
fi

npm version "${VERSION}" --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: release v${VERSION}"

TAG="v${VERSION}"
git tag -a "${TAG}" -m "Release ${TAG}"

echo "Created commit and annotated tag ${TAG}."
echo "Push to trigger the release workflow:"
echo "  git push origin \"$(git branch --show-current)\" && git push origin \"${TAG}\""
