# AiPlus-Native

AiPlus-Native is an AiPlus-flavored build of OpenCode.

- Use the upstream OpenCode TUI
- Customize the CLI and AiPlus workflow layer
- Install the latest release with one command

---

## Install

This repo is currently **private**, so use `gh` to fetch the installer:

```bash
gh api "repos/izhiwen/AiPlus-Native/contents/install.sh?ref=dev" --jq .content | tr -d '\n' | base64 -D | bash
```

```bash
cd /path/to/your/project
aiplus-native
```

That is the main user path.

The installer downloads the latest GitHub release asset for **macOS Apple Silicon** and installs the canonical hardlinked command pair `aiplus-native` + `aiplus-daemon` into `~/.local/bin/`.

On macOS, the same install also re-creates `~/Library/LaunchAgents/com.aiplus.aiplus-daemon.plist`, which runs one shared user-scoped daemon for all projects on fixed port `37367`. Re-running `install.sh` after an upgrade refreshes both hardlinks after binary replacement, so the launchd target does not stay pinned to an old inode.

If `~/.local/bin` is not in your `PATH`, the installer will show the exact command to add it.

`aiplus-native` is the interactive user entrypoint. `aiplus-daemon` is the launchd target. They should always resolve to the same installed binary.

### Important

- The **release binary** may lag behind the current `dev` branch.
- If you want the newest TUI fixes from `dev`, use the source path below until a newer release is cut.
- If this repo becomes public later, the raw GitHub installer URL can be used again.
- If you keep `~/.local/bin/aiplus-native-next`, treat it as an optional local wrapper only. It is **not** the source of truth; the canonical installed names are `aiplus-native` and `aiplus-daemon`.

## From source

```bash
git clone git@github.com:izhiwen/AiPlus-Native.git
cd AiPlus-Native
bun install
bun run dev
```

Requires:

- **Bun >= 1.3.14**
- macOS Apple Silicon for the current one-line binary installer path

---

## Notes

- TUI stays close to upstream OpenCode
- CLI continues to evolve for AiPlus workflows
- Most AiPlus-specific logic lives under `aiplus/`

---

## License

OpenCode is licensed under [Apache 2.0](LICENSE).

AiPlus-Native additions are also licensed under Apache 2.0.
