#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNINSTALL=false

usage() {
  cat >&2 <<'EOF'
Usage: bash install.sh [--uninstall]

Registers or removes the strict skill package from this repository.
  --uninstall      Remove the strict skill registration instead of installing it.
EOF
}

while (($#)); do
  case "$1" in
    --uninstall)
      UNINSTALL=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage
      exit 1
      ;;
  esac
done

if $UNINSTALL; then
  echo "Uninstalling strict skills from: $SCRIPT_DIR"
  npx skills remove -g
else
  echo "Installing strict skills from: $SCRIPT_DIR"
  npx skills add "$SCRIPT_DIR" -g
fi
