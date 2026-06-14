# AiPlus-Native

AiPlus-Native is an AiPlus-flavored build of OpenCode.

- **Use the upstream OpenCode TUI**
- **Customize the CLI and AiPlus workflow layer**
- **Install the latest release with one command**

---

## Install

### Latest release, one line

```bash
curl -fsSL https://raw.githubusercontent.com/izhiwen/AiPlus-Native/dev/install.sh | bash
```

The installer downloads the latest GitHub release asset for **macOS Apple Silicon** and installs:

```bash
~/.local/bin/aiplus-native
```

If `~/.local/bin` is not in your `PATH`, the installer will show the exact command to add it.

### Pin a version

```bash
curl -fsSL https://raw.githubusercontent.com/izhiwen/AiPlus-Native/dev/install.sh | bash -s -- v0.1.0
```

### Private-repo fallback

If the repo is private, authenticate `gh` first and then run:

```bash
gh auth login
gh release download <tag> -R izhiwen/AiPlus-Native -p install.sh -O - | bash
```

---

## Usage

After installation:

```bash
cd /path/to/your/project
aiplus-native
```

That launches the current OpenCode TUI from your project directory.

### Common commands

```bash
aiplus-native --help
aiplus-native --version
```

---

## What this project is optimizing for

AiPlus-Native currently follows this product boundary:

- **TUI**: stay close to upstream OpenCode
- **CLI**: continue to evolve for AiPlus workflows
- **Shared runtime paths**: keep compatibility bridges as small as possible

In plain English: use the upstream TUI, and put most product customization into the CLI and the `aiplus/` layer.

---

## What AiPlus-Native adds

AiPlus-Native layers AiPlus capabilities on top of OpenCode, including:

- persona-driven agent workflows
- dispatch logging
- worktree lease / coordination helpers
- compact handoff helpers
- audit and verification helpers
- CLI-oriented AiPlus flows

Most of these live under:

```text
aiplus/
```

---

## Develop from source

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

## Release artifact

The release workflow currently uploads a macOS Apple Silicon binary named:

```text
aiplus-native-darwin-arm64
```

The installer renames it locally to:

```text
aiplus-native
```

so you can launch it directly from any project directory.

---

## Project positioning

AiPlus-Native is a fork of OpenCode with a different emphasis:

- keep the OpenCode TUI experience
- add AiPlus-specific CLI and workflow capabilities
- avoid deep TUI product divergence unless strictly necessary

---

## License

OpenCode is licensed under [Apache 2.0](LICENSE).

AiPlus-Native additions are also licensed under Apache 2.0.
