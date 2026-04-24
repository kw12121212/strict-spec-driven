---
name: strict-spec-simple-task
description: Strict skill package metadata scaffold for strict-spec-simple-task.
metadata:
  skill_id: strict_spec_simple_task
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-simple-task

## This Skill's Commands


```yaml
list-changes: node {{SKILL_DIR}}/scripts/strict-spec-driven.js list
inspect-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
verify-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
```

## Prerequisites

Use strict workflow artifacts under .strict-spec-driven/.
