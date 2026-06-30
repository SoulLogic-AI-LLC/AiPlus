#!/bin/bash
set -euo pipefail

OS=$(uname -s)
ARCH=$(uname -m)
VERSION="${AIPLUS_VERSION:-latest}"
REPO="SoulLogic-AI-LLC/AiPlus"

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

ASSET_NAME="aiplus-${TARGET}.${EXT}"
RELEASE_BASE_URL="https://github.com/${REPO}/releases"
if [ "$VERSION" = "latest" ]; then
  DOWNLOAD_BASE_URL="${RELEASE_BASE_URL}/latest/download"
else
  DOWNLOAD_BASE_URL="${RELEASE_BASE_URL}/download/${VERSION}"
fi

RELEASE_URL="${DOWNLOAD_BASE_URL}/${ASSET_NAME}"
CHECKSUM_URL="${DOWNLOAD_BASE_URL}/checksums.txt"
INSTALL_DIR="${AIPLUS_INSTALL_DIR:-${HOME}/.local/bin}"
TMP_DIR=$(mktemp -d)
ARCHIVE_PATH="${TMP_DIR}/${ASSET_NAME}"
CHECKSUM_PATH="${TMP_DIR}/checksums.txt"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Installing AiPlus ${VERSION} for ${TARGET}..."
mkdir -p "$INSTALL_DIR"

curl -fsSL "$CHECKSUM_URL" -o "$CHECKSUM_PATH"
EXPECTED_SHA=$(awk -v asset="$ASSET_NAME" '$2 == asset { print $1 }' "$CHECKSUM_PATH")
if [ -z "$EXPECTED_SHA" ]; then
  echo "Release ${VERSION} does not publish ${ASSET_NAME}." >&2
  echo "Published checksums:" >&2
  sed 's/^/  /' "$CHECKSUM_PATH" >&2
  exit 1
fi

curl -fsSL "$RELEASE_URL" -o "$ARCHIVE_PATH"

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SHA=$(sha256sum "$ARCHIVE_PATH" | awk '{ print $1 }')
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL_SHA=$(shasum -a 256 "$ARCHIVE_PATH" | awk '{ print $1 }')
else
  echo "Cannot verify checksum: sha256sum or shasum is required." >&2
  exit 1
fi

if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
  echo "Checksum mismatch for ${ASSET_NAME}." >&2
  echo "Expected: ${EXPECTED_SHA}" >&2
  echo "Actual:   ${ACTUAL_SHA}" >&2
  exit 1
fi

if [ "$EXT" = "tar.gz" ]; then
  tar -xzf "$ARCHIVE_PATH" -C "$TMP_DIR"
fi

install -m 0755 "${TMP_DIR}/aiplus" "$INSTALL_DIR/aiplus"
INSTALLED_VERSION=$("$INSTALL_DIR/aiplus" --version)

if [ "$VERSION" != "latest" ]; then
  case "$INSTALLED_VERSION" in
    *"${VERSION#v}"*) ;;
    *)
      echo "Installed version smoke failed." >&2
      echo "Expected version: ${VERSION#v}" >&2
      echo "Actual output:    ${INSTALLED_VERSION}" >&2
      exit 1
      ;;
  esac
fi

echo ""
echo "✓ AiPlus ${INSTALLED_VERSION} installed to ${INSTALL_DIR}/aiplus"
echo ""
if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
  echo "Add this to your shell config (~/.zshrc or ~/.bashrc):"
  echo "  export PATH=\"${INSTALL_DIR}:$PATH\""
fi
