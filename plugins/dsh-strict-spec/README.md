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

## Supported dsh Releases

The plugin declares `engines.dsh` as `>=0.2.1-rc.2 <0.2.2` and was tested with
dsh `0.2.1-rc.2`. In a dsh release outside that range it registers no document
UI at all rather than showing a partially working viewer.

## Build From a Local Checkout

The built bundle is not committed, so build it before installing:

```sh
cd plugins/dsh-strict-spec
bun install
bun run build
```

This writes `dist/client.js` and `dist/host.js`. Rebuild after pulling changes.

## Install Into the Web Client

Install with the npm-installed `dsh` command, either as a link to the checkout:

```sh
dsh plugin --profile web add "link:$(pwd)"
```

or from a tarball packed from the checkout:

```sh
dsh plugin --profile web add "$(pwd)/$(npm pack --silent)"
```

A `link:` install follows later rebuilds of the checkout; a tarball install is a
fixed copy that you replace by packing and adding again. Then boot the web
client from the workspace you want to read:

```sh
cd /path/to/your/project
dsh web
```

Remove the plugin with `dsh plugin --profile web remove dsh-plugin-strict-spec`.

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
