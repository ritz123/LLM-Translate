#!/usr/bin/env bash
# Bump version, commit, and create an annotated tag for GitHub Releases.
# After pushing the tag, .github/workflows/release.yml builds Linux + Windows
# artifacts and attaches them to the release.
set -euo pipefail

usage() {
  echo "Usage: $(basename "$0") [patch|minor|major|<semver>]"
  echo ""
  echo "  (no arg) / patch   Bump patch from package.json (e.g. 0.1.0 -> 0.1.1)"
  echo "  minor              Bump minor (e.g. 0.1.9 -> 0.2.0)"
  echo "  major              Bump major (e.g. 0.9.0 -> 1.0.0)"
  echo "  <semver>           Set exact version (e.g. 0.2.0 or 1.0.0-rc.1)"
  echo ""
  echo "Updates package.json / package-lock.json, commits, and tags v<semver>."
  echo "Then push branch and tag so GitHub Actions can publish installers:"
  echo '  git push origin "$(git branch --show-current)" && git push origin "v<semver>"'
  exit 1
}

bump_from_package() {
  local kind="$1"
  KIND="$kind" node -e '
const kind = process.env.KIND;
const pkg = require("./package.json");
const cur = String(pkg.version);
const m = cur.match(/^(\d+)\.(\d+)\.(\d+)/);
if (!m) {
  console.error("release: could not parse X.Y.Z from package.json version:", cur);
  process.exit(1);
}
let a = +m[1], b = +m[2], c = +m[3];
if (kind === "major") {
  a++;
  b = 0;
  c = 0;
} else if (kind === "minor") {
  b++;
  c = 0;
} else {
  c++;
}
console.log(String(a) + "." + String(b) + "." + String(c));
'
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RAW="${1:-patch}"

if [[ "$RAW" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  VERSION="$RAW"
elif [[ "$RAW" == "patch" || "$RAW" == "minor" || "$RAW" == "major" ]]; then
  VERSION="$(bump_from_package "$RAW")"
else
  usage
fi

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
