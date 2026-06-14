#!/bin/sh
set -eu

# ============================================================
# AiPlus-Native installer (latest release, macOS arm64)
#
# Public repo:
#   curl -fsSL https://raw.githubusercontent.com/izhiwen/AiPlus-Native/dev/install.sh | bash
#
# Optional pinned version:
#   curl -fsSL https://raw.githubusercontent.com/izhiwen/AiPlus-Native/dev/install.sh | bash -s -- v0.1.0
#
# Private repo fallback:
#   gh release download <tag> -R izhiwen/AiPlus-Native -p install.sh -O - | bash
# ============================================================

REPO="izhiwen/AiPlus-Native"
CMD="aiplus-native"
NAME="${CMD}-darwin-arm64"

echo "AiPlus-Native installer (latest release, macOS arm64)"

# ---- download binary via gh release (works for private repos too) ----
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "  downloading ${NAME} from ${REPO}..."

# Optional first arg pins a tag. If omitted, install latest release.
RELEASE="${1:-latest}"

# Try gh first (handles private repo auth automatically)
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  if [ "$RELEASE" = "latest" ]; then
    gh release download -R "$REPO" -p "$NAME" -D "$TMP" --clobber 2>/dev/null || true
  else
    gh release download "$RELEASE" -R "$REPO" -p "$NAME" -D "$TMP" --clobber 2>/dev/null || true
  fi
  if [ -f "${TMP}/${NAME}" ]; then
    mv "${TMP}/${NAME}" "${TMP}/${CMD}"
  fi
fi

# Fallback: try curl (works if repo is public or GITHUB_TOKEN is set)
if [ ! -f "${TMP}/${CMD}" ]; then
  if [ "$RELEASE" = "latest" ]; then
    BASE="https://github.com/${REPO}/releases/latest/download"
  else
    BASE="https://github.com/${REPO}/releases/download/${RELEASE}"
  fi
  URL="${BASE}/${NAME}"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} "$URL" -o "${TMP}/${CMD}" || true
  fi
fi

if [ ! -f "${TMP}/${CMD}" ]; then
  echo ""
  echo "Error: could not download ${NAME}."
  echo "  Ensure one of:"
  echo "    - gh is installed and authenticated (gh auth login)"
  echo "    - the repo is public"
  echo "    - GITHUB_TOKEN is set"
  exit 1
fi

chmod +x "${TMP}/${CMD}"

# ---- install ----
INSTALL_DIR="${HOME}/.local/bin"
mkdir -p "$INSTALL_DIR"
mv "${TMP}/${CMD}" "${INSTALL_DIR}/${CMD}"

echo ""
echo "AiPlus-Native installed to ${INSTALL_DIR}/${CMD}"
echo "Release: ${RELEASE}"

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
echo "  Usage:"
echo "    cd /path/to/project"
echo "    ${CMD}"
