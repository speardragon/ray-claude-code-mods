#!/usr/bin/env bash
# Validates and tests each mod (or the ones named): ./scripts/check.sh [mod ...]
# `claude plugin test` may refuse to run inside a Claude Code session; set CLAUDE_CONFIG_DIR to a
# throwaway dir if it does: CLAUDE_CONFIG_DIR=$(mktemp -d) ./scripts/check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

mods=("$@")
if [ ${#mods[@]} -eq 0 ]; then
  for dir in mods/*/; do mods+=("$(basename "$dir")"); done
fi

failed=()
for mod in "${mods[@]}"; do
  echo "── $mod"
  if ! claude plugin validate "mods/$mod" >/tmp/ccmods-validate.$$ 2>&1; then
    cat /tmp/ccmods-validate.$$
    failed+=("$mod (validate)")
    continue
  fi
  grep -E '✔|✘' /tmp/ccmods-validate.$$ | tail -1
  if ls "mods/$mod"/tests/*.test.ts* >/dev/null 2>&1; then
    claude plugin test "mods/$mod" 2>&1 | tail -3 || failed+=("$mod (test)")
  fi
done
rm -f /tmp/ccmods-validate.$$

# Every mod folder is listed in the marketplace, and every listing has a folder.
listed=$(jq -r '.plugins[].source' .claude-plugin/marketplace.json | sed 's#^\./mods/##' | sort)
present=$(ls -1 mods | sort)
if [ "$listed" != "$present" ]; then
  echo "marketplace.json and mods/ disagree:"
  diff <(echo "$listed") <(echo "$present") || true
  failed+=("marketplace")
fi

if [ ${#failed[@]} -gt 0 ]; then
  echo "failed: ${failed[*]}"
  exit 1
fi
echo "all good"
