#!/bin/sh
set -eu

# ============================================================
# AiPlus-Native installer (latest release, macOS arm64)
#
# Private repo:
#   gh api "repos/izhiwen/AiPlus-Native/contents/install.sh?ref=dev" --jq .content | tr -d '\n' | base64 -D | bash
#
# Optional pinned version:
#   gh api "repos/izhiwen/AiPlus-Native/contents/install.sh?ref=dev" --jq .content | tr -d '\n' | base64 -D | bash -s -- v0.1.0
#
# Public repo fallback (if the repo is opened later):
#   curl -fsSL https://raw.githubusercontent.com/izhiwen/AiPlus-Native/dev/install.sh | bash
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

# ---- install launchd watchdog (macOS only) ----
# After install, the daemon is supervised by launchd so it:
#   - auto-starts at login/reboot (RunAtLoad)
#   - auto-restarts on crash (KeepAlive, throttled to 1 per 10s)
#   - logs to /tmp/aiplus-native-launchd.log
# End users don't need to run anything else.
# Linux: systemd support is a follow-up; this section is silently skipped.
WATCHDOG_STATUS=""
if [ "$(uname 2>/dev/null)" = "Darwin" ]; then
  PLIST_LABEL="com.aiplus.aiplus-native-daemon"
  PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
  mkdir -p "$(dirname "$PLIST_PATH")"
  cat > "$PLIST_PATH" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${INSTALL_DIR}/${CMD}</string>
        <string>daemon</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${HOME}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>/tmp/aiplus-native-launchd.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/aiplus-native-launchd.log</string>
    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
PLIST_EOF
  # If a previous version of the watchdog is loaded (upgrade re-run),
  # unload it first so the new plist content takes effect.
  launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  if launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null; then
    WATCHDOG_STATUS="enabled (auto-restart on crash, auto-start at login)"
  elif launchctl load "$PLIST_PATH" 2>/dev/null; then
    WATCHDOG_STATUS="enabled via legacy launchctl"
  else
    WATCHDOG_STATUS="installed but not loaded — try: launchctl load $PLIST_PATH"
  fi
fi

echo ""
echo "AiPlus-Native installed to ${INSTALL_DIR}/${CMD}"
echo "Release: ${RELEASE}"
if [ -n "$WATCHDOG_STATUS" ]; then
  echo "Watchdog: ${WATCHDOG_STATUS}"
  echo "  Log:     tail -f /tmp/aiplus-native-launchd.log"
  echo "  Status:  launchctl list | grep ${PLIST_LABEL}"
  echo "  Remove:  launchctl bootout gui/\$(id -u)/${PLIST_LABEL} && rm ${PLIST_PATH}"
fi

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
