---
name: strict-spec-release
description: Cut and publish a dsh-plugin-strict-spec release through the public GitHub Releases channel. Verify preconditions, bump the plugin version, refresh the README install URLs, commit and push, tag plugin-v<version>, watch the release workflow, and verify the public asset. Use when the requester asks to 发布/发版/release/publish/cut a plugin version, ship a new dsh-plugin-strict-spec release, make a release tag, or handle a failed release workflow run.
metadata:
  skill_id: strict_spec_release
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

You are cutting a public release of the dsh strict-spec plugin. The release
channel, its discipline, and its failure modes were established live on
2026-10-21; follow this procedure exactly rather than improvising against a
public channel.

## This Skill's Commands

If you cannot remember the exact command used by this skill, look it up here
before running anything. Do not guess.

```yaml
check-workflow-state: strict-spec-cli check-workflow-state
modify: strict-spec-cli modify [change-name|archive-dir]
```

## Preferred Human Language

Comply with `preferred_human_language` from `.strict-spec-driven/config.yaml` —
the user's common human language, not a programming language — for all
user-facing and generated operator-facing text, unless that file is absent or
the active user message asks otherwise.

## Preconditions

Before any other step, run `strict-spec-cli check-workflow-state`. If
`.strict-spec-driven/` is missing, stop immediately and tell the user to run
`/strict-spec-init`. Do not run `init` from this skill.

1. Run `strict-spec-cli modify` with no argument. Refuse to cut a release
   while any active change exists — release only from a fully archived and
   pushed state.
2. Confirm the working tree is clean and the branch is not ahead of origin
   (`git status -sb`).
3. Confirm `gh auth status` reports a logged-in account with access to the
   repository.
4. Agree on the version with the requester: semver patch for fixes, minor for
   features. It must differ from the `version` in
   plugins/dsh-strict-spec/package.json.

## Release Steps

1. Bump `version` in plugins/dsh-strict-spec/package.json to the agreed value.
2. Refresh the example release URL in both plugin READMEs (README.md and
   README.zh.md install sections): replace the old `plugin-v<old>` tag and the
   old tarball filename with the new version. Keep every marker the release
   suite checks — engines range, link install, npm pack, desktop install,
   `dsh --version` SOP, `builtinTooling`, the npm install command, the
   releases-download URL, and the counterpart-language README links.
3. Rebuild inside plugins/dsh-strict-spec: `bun install && bun run build`, per
   the rebuild-after-source-edits standard.
4. Commit the release (for example
   `chore: release dsh-plugin-strict-spec <version>`) and push to origin.
5. Tag and push: `git tag plugin-v<version> && git push origin plugin-v<version>`.
   The tag must equal `plugin-v` plus the exact committed plugin version — the
   workflow fails closed on any mismatch.
6. Take the run id from `gh run list --limit 2` and run
   `gh run watch <run-id> --exit-status`. The expected green shape is:
   `release` succeeded, `npm-token-gate` succeeded, `publish-npm` SKIPPED.
   A skipped npm job is the dormant-by-design state when no NPM_TOKEN
   repository secret exists — it is not a failure; do not try to fix it.

## Verify the Public Asset

- `gh release view plugin-v<version> --json name,isDraft,assets`: the tarball
  asset is present and `isDraft` is false.
- Anonymous download of the asset URL must return HTTP 200.
- Optional end-to-end smoke in an isolated home:
  `DSH_HOME="$(mktemp -d)" dsh plugin --profile web add <asset-url>`, then
  confirm the installed
  `node_modules/dsh-plugin-strict-spec/dist/` holds `client.js`, `host.js`,
  `cli/`, and the bundled skills, then run the bundled
  `dist/cli/strict-spec-cli.js check-workflow-state` once.

## When the Run Fails

- Read `gh run view <run-id> --log-failed` before changing anything.
- Fix the defect through a narrow bugfix strict change
  (route through the `strict-spec-bugfix` skill), complete its suite and
  verification, archive, commit, and push. Never hotfix-push past the workflow
  discipline.
- After the fix lands, move the tag so the workflow reruns on the fixed
  commit: delete and push-delete the tag, then re-tag and push. Moving a tag
  is acceptable only before the release has real consumers.
- Known traps from the 0.3.0 cycle: a clean runner must install the repository
  root's dependencies before the plugin build — if the build cannot resolve
  ajv, ajv-formats, or js-yaml, the workflow's root install steps regressed;
  and a job-level `if` may read only the github, needs, vars, and inputs
  contexts — the token decision travels through a gate job's needs output,
  which the release suite's workflow inspection guards.

## Rules

- Never publish outside the tag-triggered CI run; the
  plugin-publishes-only-from-ci-tag standard owns this.
- The npm channel stays dormant unless an NPM_TOKEN repository secret is
  configured; activating it is a configuration act, not a code change.
- Do not widen the engines.dsh pin as part of a release; that is its own
  planned change per the narrow-engines-dsh-pin standard.
- Report the release result with the asset URL so the requester can verify it
  anonymously.
