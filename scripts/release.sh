#!/usr/bin/env bash
# scripts/release.sh — Build + tag + release aiplus-native, guaranteed correct naming.
#
# Usage: scripts/release.sh <version>
# Example: scripts/release.sh 0.3.1
#
# This script exists because build.ts outputs binaries named "opencode" but
# install.sh expects "aiplus-native-darwin-arm64". Manual releases kept
# uploading the wrong asset name. This script ensures the name is always correct.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>" >&2
  echo "Example: $0 0.3.1" >&2
  exit 1
fi

VERSION="$1"
REPO="SoulLogic-AI-LLC/AiPlus-Native"
CMD="aiplus-native"
PLATFORM="darwin-arm64"
ASSET="${CMD}-${PLATFORM}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Building aiplus-native v${VERSION} ==="
cd "$PROJECT_DIR/packages/opencode"
bun run script/build.ts --single

echo "=== Renaming binary to match install.sh contract ==="
DIST_BIN="dist/opencode-${PLATFORM}/bin/opencode"
if [ ! -f "$DIST_BIN" ]; then
  echo "ERROR: $DIST_BIN not found after build" >&2
  exit 1
fi
cp "$DIST_BIN" "/tmp/${ASSET}"
echo "  $(ls -lh "/tmp/${ASSET}" | awk '{print $5}') → /tmp/${ASSET}"

echo "=== Tagging v${VERSION} ==="
cd "$PROJECT_DIR"
git tag -a "v${VERSION}" -m "v${VERSION} — Release"
git push origin "v${VERSION}"

echo "=== Creating GitHub release ==="
gh release create "v${VERSION}" \
  --repo "$REPO" \
  --title "v${VERSION}" \
  --notes "Install: curl -fsSL https://raw.githubusercontent.com/${REPO}/dev/install.sh | bash" \
  "/tmp/${ASSET}"

echo ""
echo "=== Released v${VERSION} ==="
echo "  https://github.com/${REPO}/releases/tag/v${VERSION}"
