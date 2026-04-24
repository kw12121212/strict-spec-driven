#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
UNINSTALL=false

usage() {
  cat >&2 <<'EOF'
Usage: bash install.sh [--project [dir]] [--uninstall]

Registers or removes the strict skill package from this repository.
  --project [dir]  Use the provided repository path or default to this repo root.
  --uninstall      Remove the strict skill registration instead of installing it.
EOF
}

while (($#)); do
  case "$1" in
    --project)
      if (($# > 1)) && [[ "$2" != -* ]]; then
        PROJECT_DIR="$2"
        shift 2
        continue
      fi
      PROJECT_DIR="$SCRIPT_DIR"
      shift
      ;;
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

if [[ ! -d "$PROJECT_DIR" ]]; then
  printf 'Project directory does not exist: %s\n' "$PROJECT_DIR" >&2
  exit 1
fi

TARGET_DIR="$(cd "$PROJECT_DIR" && pwd)"

if $UNINSTALL; then
  echo "Uninstalling strict skills from: $TARGET_DIR"
  npx skills remove "$TARGET_DIR"
else
  echo "Installing strict skills from: $TARGET_DIR"
  npx skills add "$TARGET_DIR"
fi
