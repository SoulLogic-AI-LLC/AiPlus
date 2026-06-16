#!/usr/bin/env bash
# scripts/opencode-watchdog.sh — Monitor the opencode daemon watchdog.
#
# The launchd agent that supervises the opencode daemon is auto-installed
# by install.sh on macOS. This script is a thin wrapper for common
# monitoring tasks. It recognizes either plist label:
#   - com.aiplus.aiplus-native-daemon       (end-user install via install.sh)
#   - com.aiplus.opencode-daemon-watchdog   (dev install, separate plist)
#
# Subcommands:
#   status    — show launchctl / port / health in one shot
#   restart   — kill the daemon (watchdog will auto-restart in ~3s)
#   logs      — tail the launchd output (tries both known log paths)
#
# Usage: scripts/opencode-watchdog.sh [status|restart|logs]

set -euo pipefail

PORT=4096
KNOWN_LABELS=(
  "com\\.aiplus\\.aiplus-native-daemon"
  "com\\.aiplus\\.opencode-daemon-watchdog"
)
KNOWN_LOGS=(
  "/tmp/aiplus-native-launchd.log"
  "/tmp/opencode-launchd.log"
)

cmd_status() {
  echo "=== launchctl ==="
  local pattern
  pattern="$(IFS='|'; echo "${KNOWN_LABELS[*]}")"
  local matches
  matches="$(launchctl list 2>/dev/null | grep -E "$pattern" || true)"
  if [ -n "$matches" ]; then
    echo "$matches" | sed 's/^/  /'
  else
    echo "  (no aiplus launchd agents loaded)"
  fi

  echo
  echo "=== port $PORT ==="
  local listener
  listener="$(lsof -iTCP:$PORT -sTCP:LISTEN -P 2>/dev/null | tail -n +2 || true)"
  if [ -n "$listener" ]; then
    echo "$listener" | sed 's/^/  /'
  else
    echo "  (not listening)"
  fi

  echo
  echo "=== health ==="
  local health
  health="$(curl -s -m 3 http://127.0.0.1:$PORT/global/health 2>&1 || true)"
  if [ -n "$health" ]; then
    echo "  $health"
  else
    echo "  (no response)"
  fi
}

cmd_restart() {
  local pids
  pids="$(lsof -iTCP:$PORT -sTCP:LISTEN -P -t 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    echo "[info] no daemon listening on $PORT — nothing to restart"
    return 0
  fi
  echo "[info] killing daemon pid(s): $pids"
  kill -KILL $pids 2>/dev/null || true
  echo "[ok] launchd watchdog will restart in ~4s"
}

cmd_logs() {
  local any=0
  for f in "${KNOWN_LOGS[@]}"; do
    if [ -f "$f" ]; then
      echo "=== $f (last 50) ==="
      tail -n 50 "$f"
      echo
      any=1
    fi
  done
  if [ "$any" -eq 0 ]; then
    echo "  (no log files found at the known paths)"
  fi
}

case "${1:-status}" in
  status)  cmd_status  ;;
  restart) cmd_restart ;;
  logs)    cmd_logs    ;;
  *)
    echo "Usage: $0 {status|restart|logs}" >&2
    exit 1
    ;;
esac
