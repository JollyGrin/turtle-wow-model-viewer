#!/bin/bash
#
# One-command setup for the full regression testing suite.
# Run from the repo root:
#
#   ./setup.sh /path/to/TurtleWoW
#
# This will:
#   1. Install all dependencies (viewer, demo, test tools)
#   2. Extract game data from your TurtleWoW client
#   3. Convert assets to web-ready format
#   4. Install Playwright browsers
#   5. Report readiness
#
set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
TURTLE_PATH="${1:-}"

if [ -z "$TURTLE_PATH" ]; then
  echo "Usage: ./setup.sh /path/to/TurtleWoW"
  echo ""
  echo "Example: ./setup.sh ~/Games/TurtleWoW"
  exit 1
fi

if [ ! -d "$TURTLE_PATH" ]; then
  echo "Error: TurtleWoW directory not found: $TURTLE_PATH"
  exit 1
fi

echo "=== WoW Model Viewer — Full Setup ==="
echo "  Repo: $REPO_ROOT"
echo "  WoW client: $TURTLE_PATH"
echo ""

# Step 1: Install dependencies
echo "[1/5] Installing dependencies..."
cd "$REPO_ROOT/packages/viewer" && bun install --silent
cd "$REPO_ROOT/packages/tools" && bun install --silent
cd "$REPO_ROOT/demo" && bun install --silent
cd "$REPO_ROOT/demo/test" && bun install --silent
echo "  Done."

# Step 2: Extract game data
echo ""
echo "[2/5] Extracting game data from TurtleWoW client..."
cd "$REPO_ROOT/packages/tools"
bun run setup -- "$TURTLE_PATH"
echo "  Done."

# Step 3: Convert assets
echo ""
echo "[3/5] Converting assets to web-ready format (this takes ~10 minutes)..."
cd "$REPO_ROOT/packages/tools"
bun run build-assets
echo "  Done."

# Step 4: Copy/link assets to demo
echo ""
echo "[4/5] Linking assets to demo..."
# Copy items and item-textures to demo/public (models are already git-tracked there)
if [ -d "$REPO_ROOT/packages/tools/public/items" ]; then
  cp -r "$REPO_ROOT/packages/tools/public/items" "$REPO_ROOT/demo/public/items"
  echo "  Copied items/"
fi
if [ -d "$REPO_ROOT/packages/tools/public/item-textures" ]; then
  cp -r "$REPO_ROOT/packages/tools/public/item-textures" "$REPO_ROOT/demo/public/item-textures"
  echo "  Copied item-textures/"
fi
echo "  Done."

# Step 5: Install Playwright browsers
echo ""
echo "[5/5] Installing Playwright browsers..."
cd "$REPO_ROOT/demo/test"
npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium
echo "  Done."

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Start the dev server:     cd demo && bun run dev"
echo "  2. Visit test page:          http://localhost:5173/test/"
echo "  3. Visit grid page:          http://localhost:5173/test/grid/"
echo "  4. Run scanner:              cd demo/test && bun run test:scan"
echo "  5. Check status:             cd demo/test && bun run test:status"
