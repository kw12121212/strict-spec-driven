# CLI-only YAML policy negative fixtures

Each directory here is a deliberately non-compliant Agent Skill package. Every
one names an inventory-registered mutation command, so the policy classifies it
as mutation-capable, and then carries exactly one forbidden direct-YAML-write
instruction — one package per policy category.

These packages exist to be **rejected**. `test/suites/entrypoint-and-skills.ts`
copies each one into a temporary root's `skills/` directory and runs the shipped
`validate-skills` CLI against it, asserting the command exits non-zero and emits
a `skill.cli_only_yaml.<category>` diagnostic naming the package's `SKILL.md`
path and the line the violation sits on.

Apart from that one line, each package is valid. The suite completes the
packaging in the temporary root — the `scripts` symlink and the marketplace
entry — so the forbidden instruction is the only defect left, and the run's exit
status and diagnostic list are attributable to it alone.

That is what makes the paired control run meaningful: the same package with the
forbidden line removed must validate cleanly and exit zero. Without the pair, a
non-zero exit would prove only that the fixture was broken somehow.

They are never copied into `skills/`, so the repository's own `validate-skills`
run does not see them. `test/fixtures/` is also an exempt prefix in
`src/cli-only-yaml-policy.ts`, so the `cli-only-yaml-policy` maintenance check
reads past them rather than reporting the violations they exist to contain.
