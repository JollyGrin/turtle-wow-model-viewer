#!/usr/bin/env bash
set -euo pipefail

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: ./scripts/release.sh [patch|minor|major]"
  exit 1
fi

cd packages/viewer
npm version "$BUMP" --no-git-tag-version
cd ../..

VER=$(node -p 'require("./packages/viewer/package.json").version')

git add packages/viewer/package.json
git commit -m "release: v$VER"
git tag "v$VER"

echo ""
echo "Created release v$VER"
echo "Run 'git push && git push --tags' to publish"
