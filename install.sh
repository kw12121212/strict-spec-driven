#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR=""
UNINSTALL=false

while (($#)); do
  case "$1" in
    --project)
      shift
      PROJECT_DIR="${1:-$(pwd)}"
      ;;
    --uninstall)
      UNINSTALL=true
      ;;
    *)
      ;;
  esac
  shift || true
done

TARGET_DIR="${PROJECT_DIR:-$(pwd)}"

if $UNINSTALL; then
  echo "Uninstalling strict skills from: $TARGET_DIR"
  npx skills remove "$TARGET_DIR"
else
  echo "Installing strict skills from: $TARGET_DIR"
  npx skills add "$TARGET_DIR"
fi
