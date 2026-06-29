#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNINSTALL=false

usage() {
  cat >&2 <<'EOF'
Usage: bash install.sh [--uninstall]

Registers or removes the strict skill package from this repository.
  --uninstall      Remove the strict skill registration instead of installing it.

Environment:
  STRICT_SPEC_BIN_DIR  Override the user bin directory for the native CLI.
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

DEFAULT_BIN_DIR="${XDG_BIN_HOME:-${HOME:-}/.local/bin}"
BIN_DIR="${STRICT_SPEC_BIN_DIR:-$DEFAULT_BIN_DIR}"

# Use npm exec instead of npx to avoid npm interpreting "skills" as a local
# package.json script (npm run skills) in projects that have a package.json.
# Pin to 1.5.9 to avoid upstream bug where PromptScript agent (which does not
# support global installation) is incorrectly included in global install targets.
SKILLS_CMD="npm exec skills@1.5.9 --"

if $UNINSTALL; then
  echo "Uninstalling strict skills from: $SCRIPT_DIR"
  $SKILLS_CMD remove -g
  rm -f "$BIN_DIR/strict-spec-driven"
else
  if ! command -v bun >/dev/null 2>&1; then
    printf 'bun is required to build the native strict-spec-driven executable\n' >&2
    exit 1
  fi
  echo "Building strict-spec-driven native executable"
  (cd "$SCRIPT_DIR" && bun run build && bun scripts/build-native-cli.ts --install --bin-dir "$BIN_DIR")
  echo "Installing strict skills from: $SCRIPT_DIR"
  $SKILLS_CMD add "$SCRIPT_DIR" -g -y
fi
