#!/bin/sh
set -eu

# ============================================================
# AiPlus-Native installer (latest release, macOS arm64)
#
# Private repo:
#   gh api "repos/SoulLogic-AI-LLC/AiPlus-Native/contents/install.sh?ref=dev" --jq .content | tr -d '\n' | base64 -D | bash
#
# Optional pinned version:
#   gh api "repos/SoulLogic-AI-LLC/AiPlus-Native/contents/install.sh?ref=dev" --jq .content | tr -d '\n' | base64 -D | bash -s -- v0.1.0
#
# Public repo fallback (if the repo is opened later):
#   curl -fsSL https://raw.githubusercontent.com/SoulLogic-AI-LLC/AiPlus-Native/dev/install.sh | bash
# ============================================================

REPO="SoulLogic-AI-LLC/AiPlus-Native"
CLI_CMD="aiplus-native"
DAEMON_CMD="aiplus-daemon"
FIXED_PORT="37367"
LAUNCHD_LOG="/tmp/aiplus-daemon-launchd.log"
# GitHub release asset: build.ts emits ${pkg.name}-${os}-${arch}.zip (pkg.name is
# "opencode") containing a binary named "opencode" — we rename it to the
# canonical installed commands on install.
ASSET="opencode-darwin-arm64.zip"
BIN="opencode"

if ! command -v unzip >/dev/null 2>&1; then
  echo "Error: 'unzip' is required to extract ${ASSET}."
  echo "  Install it (e.g. 'brew install unzip') and re-run."
  exit 1
fi

echo "AiPlus-Native installer (latest release, macOS arm64)"

# ---- download binary via gh release (works for private repos too) ----
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "  downloading ${ASSET} from ${REPO}..."

# Optional first arg pins a tag. If omitted, install latest release.
RELEASE="${1:-latest}"

# Try gh first (handles private repo auth automatically)
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  if [ "$RELEASE" = "latest" ]; then
    gh release download -R "$REPO" -p "$ASSET" -D "$TMP" --clobber 2>/dev/null || true
  else
    gh release download "$RELEASE" -R "$REPO" -p "$ASSET" -D "$TMP" --clobber 2>/dev/null || true
  fi
fi

# Fallback: try curl (works if repo is public or GITHUB_TOKEN is set)
if [ ! -f "${TMP}/${ASSET}" ]; then
  if [ "$RELEASE" = "latest" ]; then
    BASE="https://github.com/${REPO}/releases/latest/download"
  else
    BASE="https://github.com/${REPO}/releases/download/${RELEASE}"
  fi
  URL="${BASE}/${ASSET}"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} "$URL" -o "${TMP}/${ASSET}" || true
  fi
fi

if [ ! -f "${TMP}/${ASSET}" ]; then
  echo ""
  echo "Error: could not download ${ASSET}."
  echo "  Ensure one of:"
  echo "    - gh is installed and authenticated (gh auth login)"
  echo "    - the repo is public"
  echo "    - GITHUB_TOKEN is set"
  exit 1
fi

# Extract the binary from the zip and rename to the canonical CLI name.
EXTRACT_DIR="${TMP}/extracted"
mkdir -p "$EXTRACT_DIR"
unzip -o -q "${TMP}/${ASSET}" -d "$EXTRACT_DIR"
if [ ! -f "${EXTRACT_DIR}/${BIN}" ]; then
  echo ""
  echo "Error: ${ASSET} did not contain expected binary '${BIN}'."
  exit 1
fi
mv "${EXTRACT_DIR}/${BIN}" "${TMP}/${CLI_CMD}"

chmod +x "${TMP}/${CLI_CMD}"

# ---- install ----
INSTALL_DIR="${HOME}/.local/bin"
mkdir -p "$INSTALL_DIR"
STAGED_PATH="${INSTALL_DIR}/.${CLI_CMD}.new"
mv "${TMP}/${CLI_CMD}" "$STAGED_PATH"
rm -f "${INSTALL_DIR}/${CLI_CMD}" "${INSTALL_DIR}/${DAEMON_CMD}"
mv "$STAGED_PATH" "${INSTALL_DIR}/${CLI_CMD}"
ln "${INSTALL_DIR}/${CLI_CMD}" "${INSTALL_DIR}/${DAEMON_CMD}"

# ---- install launchd watchdog (macOS only) ----
# After install, the daemon is supervised by launchd so it:
#   - auto-starts at login/reboot (RunAtLoad)
#   - auto-restarts on crash (KeepAlive, throttled to 1 per 10s)
#   - logs to /tmp/aiplus-daemon-launchd.log
# End users don't need to run anything else.
# Linux: systemd support is a follow-up; this section is silently skipped.
WATCHDOG_STATUS=""
if [ "$(uname 2>/dev/null)" = "Darwin" ]; then
  PLIST_LABEL="com.aiplus.aiplus-daemon"
  LEGACY_PLIST_LABEL="com.aiplus.aiplus-native-daemon"
  PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
  LEGACY_PLIST_PATH="$HOME/Library/LaunchAgents/${LEGACY_PLIST_LABEL}.plist"
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
        <string>${INSTALL_DIR}/${DAEMON_CMD}</string>
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
    <string>${LAUNCHD_LOG}</string>
    <key>StandardErrorPath</key>
    <string>${LAUNCHD_LOG}</string>
    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
PLIST_EOF
  # If a previous version of the watchdog is loaded (upgrade re-run), unload it
  # first so the new plist content and binary target take effect. We also clean
  # up the legacy label/path from the earlier aiplus-native-daemon naming.
  launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl bootout "gui/$(id -u)/${LEGACY_PLIST_LABEL}" 2>/dev/null || true
  launchctl unload "$LEGACY_PLIST_PATH" 2>/dev/null || true
  rm -f "$LEGACY_PLIST_PATH"
  if launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null; then
    WATCHDOG_STATUS="enabled (shared per-user daemon, auto-restart on crash, auto-start at login)"
  elif launchctl load "$PLIST_PATH" 2>/dev/null; then
    WATCHDOG_STATUS="enabled via legacy launchctl"
  else
    WATCHDOG_STATUS="installed but not loaded — try: launchctl load $PLIST_PATH"
  fi
fi

echo ""
echo "AiPlus-Native installed to ${INSTALL_DIR}/${CLI_CMD}"
echo "Daemon hardlink: ${INSTALL_DIR}/${DAEMON_CMD}"
echo "Release: ${RELEASE}"
echo "Shared daemon: fixed user-scoped service on port ${FIXED_PORT}"
if [ -n "$WATCHDOG_STATUS" ]; then
  echo "Watchdog: ${WATCHDOG_STATUS}"
  echo "  Log:     tail -f ${LAUNCHD_LOG}"
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
echo "    ${CLI_CMD}"
