# scripts/

Operational scripts for the AiPlus-Native repo. Currently:

| script | purpose |
|---|---|
| `opencode-watchdog.sh` | Monitor the launchd-managed shared AiPlus daemon. Subcommands: `status`, `restart`, `logs`. The launchd agent itself is auto-installed by `install.sh` on macOS — this helper is an operator tool, not the installer. |

## Usage

```sh
# One-time setup (after cloning the repo on a new machine) — NOT this script:
curl -fsSL https://raw.githubusercontent.com/SoulLogic-AI-LLC/AiPlus-Native/dev/install.sh | bash
# install.sh handles the binary + the launchd plist in one go.

# Daily check for the shared user-scoped daemon on port 37367:
scripts/opencode-watchdog.sh status

# Force a daemon restart (launchd will bring it back):
scripts/opencode-watchdog.sh restart

# Tail the launchd output:
scripts/opencode-watchdog.sh logs
```

## How it works

The launchd agent is installed at `~/Library/LaunchAgents/com.aiplus.aiplus-daemon.plist` by `install.sh`. It runs `~/.local/bin/aiplus-daemon` directly with `KeepAlive: true` and `RunAtLoad: true`, so one shared user-scoped daemon auto-restarts after a crash and auto-starts at login/reboot.

The shared daemon listens on fixed port `37367`. `install.sh` also re-creates the hardlinked command pair `aiplus-native` + `aiplus-daemon` on every run, so upgrades do not leave the launchd target pointing at an old inode.

The plist is **not** in this repo (macOS-level config; doesn't belong in project git). `install.sh` re-creates it on every run with paths bound to the current machine. If you keep a local wrapper like `~/.local/bin/aiplus-native-next`, treat it as convenience only — it is not the source of truth and is not managed by the installer.

## Recognized plist labels

This script recognizes the current label plus migration/dev labels (in case you have either or both):

- `com.aiplus.aiplus-daemon` — the current end-user plist created by `install.sh`
- `com.aiplus.aiplus-native-daemon` — the legacy end-user plist from earlier installs
- `com.aiplus.opencode-daemon-watchdog` — a dev plist that points to a development build (not created by `install.sh`)

Both can coexist; `status` will show whichever are loaded.
