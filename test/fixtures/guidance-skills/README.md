# Shipped guidance-check negative fixtures

Each directory here is a deliberately non-compliant Agent Skill package carrying
exactly one shared-guidance defect that `validate-skills` must reject. They are
separate from `test/fixtures/policy-skills/`, whose packages exist one per
CLI-only YAML policy category and are registered as mutation surfaces; the
packages here instruct no YAML write at all, because the defects they carry are
about how guidance names skills and how often it states a shared instruction.

`test/suites/entrypoint-and-skills.ts` copies each one into a temporary root
alongside the whole bundled skill set and runs the shipped `validate-skills` CLI
against it, asserting the command exits non-zero and emits the expected
diagnostic naming the package's `SKILL.md` path.

The bundled set is seeded rather than omitted because every valid strict skill
routes an operator to `/strict-spec-init`: in a root holding one package that
routing points at nothing, and the absent-reference check would report the
fixture's isolation instead of the defect under test.

Apart from the one defect, each package is valid, and the suite completes the
packaging in the temporary root. That is what makes the paired control run
meaningful: the same package with the offending line removed must validate
cleanly and exit zero. Without the pair, a non-zero exit would prove only that
the fixture was broken somehow.
