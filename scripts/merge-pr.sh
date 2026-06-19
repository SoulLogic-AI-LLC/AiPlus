#!/bin/zsh
set -euo pipefail

PR="$1"
REPO="SoulLogic-AI-LLC/AiPlus-Native"

# macOS dialog gate: user must click "Merge" to proceed
osascript -e "display dialog \"Merge PR #$PR to dev?\" buttons {\"Cancel\", \"Merge\"} default button \"Cancel\"" 2>/dev/null || exit 0

cd /Users/steve/Projects/AiPlus-Native-agent
PATH="/opt/homebrew/bin:$PATH" gh pr merge "$PR" --repo "$REPO" --merge
