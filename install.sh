#!/bin/bash
set -euo pipefail

OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) TARGET="aarch64-apple-darwin" ;;
      x86_64) TARGET="x86_64-apple-darwin" ;;
      *) echo "Unsupported macOS architecture: $ARCH" >&2; exit 1 ;;
    esac
    EXT="tar.gz"
    ;;
  Linux)
    case "$ARCH" in
      x86_64) TARGET="x86_64-unknown-linux-gnu" ;;
      aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
      *) echo "Unsupported Linux architecture: $ARCH" >&2; exit 1 ;;
    esac
    EXT="tar.gz"
    ;;
  *)
    echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

RELEASE_URL="https://github.com/izhiwen/AiPlus_StarWeaver/releases/download/${TAG}/aiplus-${TARGET}.${EXT}"
CHECKSUM_URL="${RELEASE_URL}.sha256"

echo "Installing AiPlus ${TAG} for ${TARGET}..."
INSTALL_DIR="${HOME}/.local/bin"
mkdir -p "$INSTALL_DIR"

curl -fsSL "$RELEASE_URL" -o "/tmp/aiplus-${TAG}.${EXT}"

if [ "$EXT" = "tar.gz" ]; then
  tar -xzf "/tmp/aiplus-${TAG}.${EXT}" -C /tmp
fi

install -m 0755 /tmp/aiplus "$INSTALL_DIR/aiplus"
rm -f "/tmp/aiplus-${TAG}.${EXT}" /tmp/aiplus

echo ""
echo "✓ AiPlus ${TAG} installed to ${INSTALL_DIR}/aiplus"
echo ""
if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
  echo "Add this to your shell config (~/.zshrc or ~/.bashrc):"
  echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
fi
