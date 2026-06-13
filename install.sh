#!/bin/sh
set -eu

# ============================================================
# AiPlus-Native installer — one-line binary install
# Usage: curl -fsSL https://raw.githubusercontent.com/izhiwen/AiPlus-Native/main/install.sh | bash
# ============================================================

REPO="izhiwen/AiPlus-Native"
CMD="aiplus-native"

# ---- detect OS ----
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$OS" in
  darwin)  OS="darwin" ;;
  linux)   OS="linux" ;;
  *)
    echo "Unsupported OS: $OS"
    echo "AiPlus-Native currently supports macOS and Linux."
    exit 1
    ;;
esac

# ---- detect arch ----
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

# ---- construct asset name ----
# Matches the binary names uploaded by the release workflow:
#   aiplus-native-darwin-arm64
#   aiplus-native-darwin-x64
#   aiplus-native-linux-x64
#   aiplus-native-linux-arm64
NAME="${CMD}-${OS}-${ARCH}"

# ---- download ----
BASE="https://github.com/${REPO}/releases/latest/download"
URL="${BASE}/${NAME}"

echo "AiPlus-Native installer"
echo "  platform: ${OS}-${ARCH}"
echo "  downloading: ${URL}"
echo ""

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if command -v curl >/dev/null 2>&1; then
  curl -fsSL --progress-bar "$URL" -o "${TMP}/${CMD}"
elif command -v wget >/dev/null 2>&1; then
  wget -q --show-progress "$URL" -O "${TMP}/${CMD}"
else
  echo "Error: curl or wget is required to download AiPlus-Native."
  exit 1
fi

chmod +x "${TMP}/${CMD}"

# ---- install ----
INSTALL_DIR="${HOME}/.local/bin"
mkdir -p "$INSTALL_DIR"
mv "${TMP}/${CMD}" "${INSTALL_DIR}/${CMD}"

echo ""
echo "AiPlus-Native installed to ${INSTALL_DIR}/${CMD}"

# ---- PATH check ----
if ! echo "$PATH" | tr ':' '\n' | grep -Fxq "$INSTALL_DIR"; then
  echo ""
  echo "  Add ${INSTALL_DIR} to your PATH:"
  echo ""
  case "$(basename "$SHELL")" in
    zsh)  echo '  echo '\''export PATH="$HOME/.local/bin:$PATH"'\'' >> ~/.zshrc && source ~/.zshrc' ;;
    bash) echo '  echo '\''export PATH="$HOME/.local/bin:$PATH"'\'' >> ~/.bashrc && source ~/.bashrc' ;;
    *)    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
  esac
fi

echo ""
echo "  Run: ${CMD}"
