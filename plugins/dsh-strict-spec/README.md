# dsh-plugin-strict-spec

[中文](README.zh.md)

A read-only viewer for strict workflow documents inside DeepSeek Harness (dsh).
It shows the `.strict-spec-driven/` directory of a Session's workspace as a
document tree and renders each strict YAML artifact in a view made for it.

The package is internal to this repository. It is never published to npm or
listed in any plugin market; install it from a local checkout or from a tarball
you pack yourself.

## What It Shows

- **Two entry points.** A *Strict documents* row in the left sidebar opens a
  full page with a Session picker that groups Sessions by workspace and
  remembers the last choice. A *Strict documents* entry in the right sidebar's
  guide opens a tab bound to the active Session, beside the conversation.
- **A document tree.** Artifact families appear in a fixed order — config,
  architecture, roadmap, changes, scenes, specs, tech, lessons, SOPs, and design
  system — and families absent from the workspace are omitted. Archived groups
  start collapsed and are read only when expanded. Milestones and planned
  changes carry their declared status, active changes carry their task
  completion, and a directory cut short by the host's listing limit shows a
  truncation marker. The tree is keyboard navigable.
- **Dedicated views** for change artifacts (proposal, design, tasks, questions,
  and delta specs, scenes, and tech), roadmap artifacts (index, milestones,
  planned changes), specs and scenes (with requirement keyword emphasis and scene
  step coverage links that open the covering requirement), and project context
  (config, architecture, technical standards, lessons, SOPs, design system).
  Fields a view does not lay out are appended under an additional-fields
  section, and any other artifact type opens in a generic structured view, so
  no content is hidden.
- **Live refresh.** Loaded directories and the open document update when their
  files change on disk.
- **An empty state** for a workspace without `.strict-spec-driven/`, and a
  parse-error view with the raw text for YAML that cannot be parsed.

## Read-Only Guarantee

The viewer offers no control that writes, edits, or deletes strict workflow
files, and viewing never changes a file. Views show declared field values
exactly as written; they never compute roadmap status or validation results.
Change strict artifacts through `strict-spec-cli` as usual.

## Built-in Strict Tooling

The plugin carries the strict workflow's own tooling, so installing the plugin
is enough — no separate `install.sh` run, global `strict-spec-cli`, or skills
registration is required:

- While the built-in tooling switch is **enabled (the default)**, the plugin
  registers every strict skill package onto the host's skill registry from the
  skill bodies bundled inside the plugin, and the commands those skills serve
  run the `strict-spec-cli` bundled inside the plugin, invoked through the
  dsh host's own node runtime. Nothing is written to any `bin` directory and
  no `PATH` lookup happens: the built-in CLI is reachable inside agent
  sessions, not from your terminal.
- While the switch is enabled, **external copies win**: a same-name strict
  skill installed under a project or user skill root (for example by an
  earlier `install.sh` run) takes precedence over the plugin's built-in copy,
  and the session runs the external copy's body and the CLI it states. This
  is the dsh skill registry's designed layering — a preset's local discovery
  registers nearer than this plugin's deployment-level registration, and
  within one layer every filesystem root rank beats the bundled band — so no
  preset override or other deployment trick is involved.
- The built-in copies are the **zero-install fallback**: a skill name no
  external root offers falls through to the plugin's built-in copy, so a
  machine with nothing installed still lists and runs every strict skill from
  the plugin alone. To make the built-in copy win for a name on a machine
  that also carries an external copy, remove the external copy
  (`bash install.sh --uninstall` clears the global registration).
- The whole provision is **one switch**, because the skills and the CLI are one
  thing: the served skill bodies are the bundled CLI's only session entry
  point. Turn it off and the built-in skills disappear, any external
  installation becomes the effective one again, and the viewer keeps working
  unchanged. `install.sh` and the global install path keep working either way.

Flip the switch through the plugin row's config in the profile's
`cordis.patch.yml` — no reinstall is needed:

```yaml
- id: ui-strict-spec
  name: dsh-plugin-strict-spec
  config:
    builtinTooling: false
```

Omitting the `config` block (or the whole entry) keeps the switch at its
default, enabled.

## Supported dsh Releases

The plugin declares `engines.dsh` as `>=0.2.1-rc.2 <0.2.2` and was tested with
dsh `0.2.1-rc.2`. In a dsh release outside that range it registers no document
UI at all rather than showing a partially working viewer.

## Install Into the Web Client

The built bundle is not committed, so a fresh clone builds it and installs it
in one block — run this from the repository root:

```sh
cd plugins/dsh-strict-spec
bun install
bun run build
dsh plugin --profile web add "link:$(pwd)"
```

This writes `dist/client.js` and `dist/host.js`, then adds the plugin with the
npm-installed `dsh` command. Alternatively, install from a tarball packed from
the built checkout:

```sh
dsh plugin --profile web add "$(pwd)/$(npm pack --silent)"
```

A `link:` install follows later rebuilds of the checkout — after pulling
changes, run `bun run build` inside `plugins/dsh-strict-spec` again; a tarball
install is a fixed copy that you replace by packing and adding again. Then boot
the web client from the workspace you want to read:

```sh
cd /path/to/your/project
dsh web
```

Remove the plugin with `dsh plugin --profile web remove dsh-plugin-strict-spec`.

## Upgrading the dsh Host

The plugin is pinned to the dsh release it was built against (see
`engines.dsh` above), and widening that pin is its own planned change under
this repository's narrow-engines-dsh-pin technical standard — never bump the
pin as a side effect of another change. After upgrading the dsh host:

1. Check the running release with `dsh --version` against the pinned range.
2. Missing *Strict documents* panel? That is the pin, not a broken install:
   outside the pinned range the plugin deliberately registers no document UI.
3. Plan a change that bumps `engines.dsh` in
   `plugins/dsh-strict-spec/package.json` to the new patch line, retests the
   viewer against that release, and lands any adapter fixes it needs.
4. In that change's checkout, rebuild (`bun install && bun run build` inside
   `plugins/dsh-strict-spec`) and, for a tarball install, pack and add again;
   a `link:` install keeps pointing at the checkout and only needs the
   rebuild.
5. Restart `dsh web` (fully quit Desktop first) so the profile recomposes, and
   refresh the page.

The commands in this SOP that run today — build, `link:` install into an
isolated profile, host boot, and browser load of both entry points — were
verified against dsh 0.2.1-rc.2. The future-release leg (steps 3–4 against a
host outside the pinned range) cannot be run until such a release exists.

## Install Into the Desktop Profile

The `desktop` profile belongs to the DeepSeek Harness Desktop application, and
the npm-installed `dsh` refuses to manage it. Use the `dsh` command bundled with
the Desktop installation instead:

1. Open DeepSeek Harness Desktop once so it initializes its profile, then quit
   it completely.
2. With the Desktop-bundled `dsh`, run the same `add` command against the
   desktop profile, using either spec:

   ```sh
   dsh plugin --profile desktop add "link:/path/to/strict-spec-driven/plugins/dsh-strict-spec"
   ```

3. Start Desktop again.

Keep Desktop closed while it is being installed into, and remove the plugin the
same way with `remove dsh-plugin-strict-spec`.

These desktop steps follow the dsh 0.2.1-rc.2 documentation for the
Desktop-owned profile but have not yet been run end to end; the web client
install is the verified path.
