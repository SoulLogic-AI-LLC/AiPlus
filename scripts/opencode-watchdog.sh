#!/usr/bin/env bash
# scripts/opencode-watchdog.sh — Monitor the shared AiPlus daemon.
#
# The launchd agent that supervises the daemon is auto-installed by install.sh
# on macOS. It runs one shared user-scoped daemon for all projects on a fixed
# port. This script is a thin wrapper for common monitoring tasks. It
# recognizes these plist labels:
#   - com.aiplus.aiplus-daemon              (current end-user install)
#   - com.aiplus.aiplus-native-daemon       (legacy end-user install)
#   - com.aiplus.opencode-daemon-watchdog   (dev install, separate plist)
#
# Subcommands:
#   status    — show launchctl / port / health in one shot
#   restart   — restart the shared daemon or kill its listener
#   logs      — tail the launchd output (tries both known log paths)
#
# Usage: scripts/opencode-watchdog.sh [status|restart|logs]

set -euo pipefail

PORT=37367
KNOWN_SERVICES=(
  "com.aiplus.aiplus-daemon"
  "com.aiplus.aiplus-native-daemon"
  "com.aiplus.opencode-daemon-watchdog"
)
KNOWN_LABELS=(
  "com\\.aiplus\\.aiplus-daemon"
  "com\\.aiplus\\.aiplus-native-daemon"
  "com\\.aiplus\\.opencode-daemon-watchdog"
)
KNOWN_LOGS=(
  "/tmp/aiplus-daemon-launchd.log"
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
  echo "=== shared port $PORT ==="
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
    if command -v launchctl >/dev/null 2>&1; then
      local service
      for service in "${KNOWN_SERVICES[@]}"; do
        if launchctl kickstart -k "gui/$(id -u)/$service" 2>/dev/null; then
          echo "[ok] kickstarted launchd service: $service"
          return 0
        fi
      done
    fi
    echo "[info] no shared daemon listening on $PORT and no known launchd service responded"
    return 0
  fi
  echo "[info] killing daemon pid(s): $pids"
  kill -KILL $pids 2>/dev/null || true
  echo "[ok] launchd will restart the shared daemon shortly"
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
