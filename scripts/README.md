# scripts/

Operational scripts for the AiPlus-Native repo. Currently:

| script | purpose |
|---|---|
| `opencode-watchdog.sh` | Monitor the launchd-managed opencode daemon. Subcommands: `status`, `restart`, `logs`. The launchd agent itself is auto-installed by `install.sh` on macOS — this helper is a read-only/observer tool, not the installer. |

## Usage

```sh
# One-time setup (after cloning the repo on a new machine) — NOT this script:
curl -fsSL https://raw.githubusercontent.com/izhiwen/AiPlus-Native/dev/install.sh | bash
# install.sh handles the binary + the launchd plist in one go.

# Daily check (works on any machine with the binary installed):
scripts/opencode-watchdog.sh status

# Force a daemon restart (watchdog will bring it back in ~3s):
scripts/opencode-watchdog.sh restart

# Tail the launchd output:
scripts/opencode-watchdog.sh logs
```

## How it works

The launchd agent is installed at `~/Library/LaunchAgents/com.aiplus.aiplus-native-daemon.plist` by `install.sh`. It runs the opencode daemon directly with `KeepAlive: true` and `RunAtLoad: true` — so the daemon auto-restarts after a crash and auto-starts at login/reboot.

The plist is **not** in this repo (macOS-level config; doesn't belong in project git). `install.sh` re-creates it on every run with paths bound to the current machine, so moving the repo to a new location just means re-running `install.sh`.

## Recognized plist labels

This script recognizes two plist labels (in case you have either or both):

- `com.aiplus.aiplus-native-daemon` — the end-user plist created by `install.sh`
- `com.aiplus.opencode-daemon-watchdog` — a dev plist that points to a development build (not created by `install.sh`)

Both can coexist; `status` will show whichever are loaded.
