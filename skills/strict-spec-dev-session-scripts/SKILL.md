---
name: strict-spec-dev-session-scripts
description: Generate standard project-local developer helper scripts (dev-start, dev-stop, dev-status, dev-logs) from .strict-spec-driven/dev-session.yaml metadata.
metadata:
  skill_id: strict_spec_dev_session_scripts
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are generating project-local developer helper scripts from a declared strict development session.

## This Skill's Commands

```yaml
dev-session-plan: node {{SKILL_DIR}}/scripts/strict-spec-driven.js dev-session-plan
```

## When to Use

Use this skill when:
- The user asks to generate, create, or regenerate developer helper scripts for their project.
- The user wants to run dev services without remembering strict CLI subcommands.
- A project has `.strict-spec-driven/dev-session.yaml` and needs human-friendly shell scripts.

Do NOT use when:
- No `.strict-spec-driven/dev-session.yaml` exists — direct the user to declare a dev session first.
- The user wants to modify the dev-session.yaml schema or the lifecycle CLI commands.
- The user wants to start or stop services directly — use the strict lifecycle commands instead.
- Required environment variable values need to be embedded in scripts — store only variable names.

## Prerequisites

The `.strict-spec-driven/` directory and a valid `.strict-spec-driven/dev-session.yaml`
must exist at the project root. If `.strict-spec-driven/` is missing, stop
immediately and tell the user to run `/strict-spec-init`. Do not run `init`
from this skill.

## Steps

Before any other step, confirm `.strict-spec-driven/` exists at the project
root. If it is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

1. **Validate the dev session declaration** — run:
   ```bash
   node {{SKILL_DIR}}/scripts/strict-spec-driven.js dev-session-plan
   ```
   If the command exits non-zero, stop and report each diagnostic to the user. Do not generate scripts from an invalid declaration.

2. **Determine output directory and script names** — default to `scripts/` in the project root. Use `dev-start`, `dev-stop`, `dev-status`, and `dev-logs` as the default script names. If the user specifies different names or a different output directory, use those instead.

3. **For each output script, check the existing state**:
   - If the file does not exist: create it directly.
   - If the file exists and contains a managed section (identified by the `BEGIN STRICT-MANAGED SECTION` marker): replace only the content between the managed-section markers, preserving all content above and below them.
   - If the file exists but has no managed section: stop and ask the user for confirmation before overwriting. Do not silently clobber user-authored scripts.

4. **Write each script with this structure**:

   ```
   #!/usr/bin/env bash
   set -euo pipefail

   # Generated from .strict-spec-driven/dev-session.yaml
   # Regenerate with: /strict-spec-dev-session-scripts

   # ============================================================
   # BEGIN STRICT-MANAGED SECTION
   # DO NOT EDIT BETWEEN THE MANAGED-SECTION MARKERS
   # ============================================================

   <generated script body — see per-script content below>

   # ============================================================
   # END STRICT-MANAGED SECTION
   # ============================================================
   ```

   After the managed section, the file may contain user-authored content. Never touch it.

5. **Generate script bodies** using the declared session metadata:

   **dev-start** — Start declared services via the strict lifecycle command. If services declare `environment.required` variables, emit a pre-flight check that prints a human-readable error and exits if any listed variable is unset. Reference variables by name only — never embed values.

   ```bash
   # Pre-flight: check required environment variables
   for var in PORT API_KEY; do
     if [ -z "${!var:-}" ]; then
       echo "ERROR: required environment variable $var is not set" >&2
       exit 1
     fi
   done

   node "$(dirname "$0")/../dist/scripts/strict-spec-driven.js" dev-session-start
   ```

   **dev-stop** — Stop any services started by the strict lifecycle command:

   ```bash
   node "$(dirname "$0")/../dist/scripts/strict-spec-driven.js" dev-session-stop
   ```

   **dev-status** — Report session status:

   ```bash
   node "$(dirname "$0")/../dist/scripts/strict-spec-driven.js" dev-session-status
   ```

   **dev-logs** — Print logs for a service. Pass through any arguments so users can specify a service ID when multiple services are declared:

   ```bash
   node "$(dirname "$0")/../dist/scripts/strict-spec-driven.js" dev-session-logs "$@"
   ```

6. **Make scripts executable** — after writing each file, run `chmod +x <script-path>` so scripts can be executed directly without `bash` prefix.

7. **Report the output** — list each file that was created or updated, note whether the managed section was regenerated or the file was freshly created, and remind the user of the required environment variables for any service that declares them.

## Secret Safety Rules

- Never write environment variable values into generated scripts.
- Use only the variable names declared in `environment.required` and `environment.optional` from the session metadata.
- Emit a pre-flight check in `dev-start` that validates required variables are set before attempting to start services.
- If `unavailable_conditions` lists setup steps, echo them as human-readable hints inside the pre-flight check or in a comment.

## Managed Section Contract

- The managed section is delimited by lines containing exactly `BEGIN STRICT-MANAGED SECTION` and `END STRICT-MANAGED SECTION`.
- Content between the markers is entirely owned by this skill. All other content in the file is user-owned.
- On regeneration, replace the content between the markers (inclusive of the marker lines themselves) with the freshly generated body.
- If a marker is present without its pair (only BEGIN or only END), report the inconsistency to the user and stop rather than overwriting.

## Rules

- Do not generate scripts if `dev-session-plan` exits non-zero.
- Do not embed secret values — only variable names.
- Do not silently overwrite a script that has no managed section.
- Preserve all user-authored content outside managed sections.
- Make every generated script executable.
- The strict lifecycle CLI commands are the script implementation — do not reproduce their logic in shell.
