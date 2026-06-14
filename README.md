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

The installer downloads the latest GitHub release asset for **macOS Apple Silicon** and installs `aiplus-native` into `~/.local/bin/`.

If `~/.local/bin` is not in your `PATH`, the installer will show the exact command to add it.

### Important

- The **release binary** may lag behind the current `dev` branch.
- If you want the newest TUI fixes from `dev`, use the source path below until a newer release is cut.
- If this repo becomes public later, the raw GitHub installer URL can be used again.

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
