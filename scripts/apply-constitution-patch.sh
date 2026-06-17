#!/bin/zsh
set -euo pipefail

# macOS dialog gate: user must click "Apply" to proceed
osascript -e "display dialog \"Apply constitution patch v0.7?\n\n§II.8: Advisor merge 授权例外\n§II.10: 宪法修改批准门禁\" buttons {\"Cancel\", \"Apply\"} default button \"Cancel\"" 2>/dev/null || exit 0

CONSTITUTION="$HOME/.aiplus/constitution.md"

if [[ ! -f "$CONSTITUTION" ]]; then
  echo "ERROR: $CONSTITUTION not found"
  exit 1
fi

python3 - "$CONSTITUTION" <<'PYEOF'
import sys

path = sys.argv[1]
with open(path, "r") as f:
    lines = f.readlines()

output = []
made_version = False
made_ii8 = False
made_ii10 = False

for i, line in enumerate(lines):
    # Change 1: Version bump v0.6 → v0.7
    if not made_version and line.startswith("Version: 0.6"):
        output.append("Version: 0.7 (amended 2026-06-17; §II.8 Advisor merge 授权例外; §II.10 宪法修改批准门禁)\n")
        made_version = True
        continue

    # Change 2: §II.8 — append Advisor merge exception after "STOP-level gate."
    if not made_ii8 and "Violation of this boundary is a STOP-level gate." in line:
        output.append(line)
        output.append("\n")
        output.append("     例外：Advisor 在 Owner 显式批准后可执行 git merge。批准通过\n")
        output.append("     scripts/merge-pr.sh 对话框机制强制确认。\n")
        made_ii8 = True
        continue

    # Change 3: §II.10 — insert after §II.9 (after "此条适用于 Owner 和所有协调角色。")
    if not made_ii10 and "此条适用于 Owner 和所有协调角色。" in line:
        output.append(line)
        output.append("\n")
        output.append("10. **宪法修改走批准门禁 / Constitution edits require Owner gate.**\n")
        output.append("    任何对 ~/.aiplus/constitution.md 的修改必须通过显式 Owner 批准\n")
        output.append("    （对话框/allow 机制）。批准后可由 Agent 代为执行写入。\n")
        made_ii10 = True
        continue

    output.append(line)

if not made_version:
    print("ERROR: Version line not found", file=sys.stderr)
    sys.exit(100)
if not made_ii8:
    print("ERROR: §II.8 marker not found", file=sys.stderr)
    sys.exit(101)
if not made_ii10:
    print("ERROR: §II.9 marker not found", file=sys.stderr)
    sys.exit(102)

with open(path, "w") as f:
    f.writelines(output)

print("✅ Constitution patched to v0.7")
print("   §II.8: Advisor merge 授权例外 added")
print("   §II.10: 宪法修改批准门禁 added")
PYEOF
