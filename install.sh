#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNINSTALL=false

usage() {
  cat >&2 <<'EOF'
Usage: bash install.sh [--uninstall]

Registers or removes the strict skill package from this repository.
  --uninstall      Remove the strict skill registration instead of installing it.

The install path bootstraps its own dependencies, so bun is the only runtime
that must already be present (and it is auto-installed if missing):
  * bun is installed from https://bun.sh/install when not on PATH.
  * project dependencies are installed with `bun install` when node_modules
    is absent.
  * the global `skills` CLI is run through bunx, falling back to npm exec / npx
    on uninstall (when bun may already have been removed).

Environment:
  STRICT_SPEC_BIN_DIR  Override the user bin directory for the native CLI.
  BUN_INSTALL          Override the bun install prefix (default ~/.bun).
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

# The global `skills` package. PromptScript emits a non-fatal "does not support
# global skill installation" warning per skill (exit code stays 0) and does not
# block installation, so it is safe to ignore.
SKILLS_PKG="skills@1.5.14"

# Pick a runtime that can execute the pinned skills package. bunx is preferred
# and, unlike npx, runs the package's bin directly instead of a colliding
# `npm run skills` script. npm exec / npx are kept as uninstall fallbacks so
# `skills remove -g` still works after bun has been removed.
#
# The trailing `--` is needed for npm exec / npx to separate their own flags
# from the package's args, but bun passes `--` through to the skills CLI, which
# then rejects it as an unknown command ("Unknown command: --"), so the bunx
# invocation must omit it.
resolve_skills_cmd() {
  if command -v bun >/dev/null 2>&1; then
    printf 'bunx %s\n' "$SKILLS_PKG"
  elif command -v npm >/dev/null 2>&1; then
    printf 'npm exec %s --\n' "$SKILLS_PKG"
  elif command -v npx >/dev/null 2>&1; then
    printf 'npx %s --\n' "$SKILLS_PKG"
  else
    return 1
  fi
}

# Install bun from the official installer when it is not already on PATH.
ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    return 0
  fi

  printf 'bun not found; installing bun from https://bun.sh/install\n' >&2
  if ! { command -v curl >/dev/null 2>&1 && curl -fsSL https://bun.sh/install | bash; }; then
    if ! { command -v wget >/dev/null 2>&1 && wget -qO- https://bun.sh/install | bash; }; then
      printf 'curl or wget is required to install bun\n' >&2
      return 1
    fi
  fi

  # The installer updates shell rc files but not this process; expose bun now so
  # the build and bunx resolve it without restarting the shell.
  local bun_install="${BUN_INSTALL:-${HOME:-}/.bun}"
  export BUN_INSTALL="$bun_install"
  export PATH="$bun_install/bin:$PATH"

  if ! command -v bun >/dev/null 2>&1; then
    printf 'bun was installed but is not on PATH; add %s/bin to PATH and rerun.\n' "$bun_install" >&2
    return 1
  fi
}

# node_modules is gitignored while bun.lock is tracked, so a fresh checkout must
# install project dependencies before building the native CLI. A non-empty
# node_modules can still be incomplete (a partially-resolved install, or deps
# added since the last install), so run `bun install` unconditionally: it is
# idempotent and fast against the tracked lockfile and guarantees the build
# sees every dependency.
ensure_project_deps() {
  printf 'Installing project dependencies (bun install)\n'
  ( cd "$SCRIPT_DIR" && bun install )
}

if $UNINSTALL; then
  if ! SKILLS_CMD="$(resolve_skills_cmd)"; then
    printf 'No runtime available to run the skills CLI (need bun, npm, or npx).\n' >&2
    exit 1
  fi
  echo "Uninstalling strict skills from: $SCRIPT_DIR"
  $SKILLS_CMD remove -g
  rm -f "$BIN_DIR/strict-spec-cli"
else
  ensure_bun
  ensure_project_deps
  echo "Building strict-spec-cli native executable"
  ( cd "$SCRIPT_DIR" && bun run build && bun scripts/build-native-cli.ts --install --bin-dir "$BIN_DIR" )
  echo "Installing strict skills from: $SCRIPT_DIR"
  SKILLS_CMD="$(resolve_skills_cmd)" # bun is guaranteed present here -> bunx
  $SKILLS_CMD add "$SCRIPT_DIR" -g -y
fi
