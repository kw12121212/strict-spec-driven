---
name: strict-spec-brainstorm
description: Strict skill package metadata scaffold for strict-spec-brainstorm.
metadata:
  skill_id: strict_spec_brainstorm
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-brainstorm

## This Skill's Commands


```yaml
propose-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
verify-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
```

## Prerequisites

Use strict workflow artifacts under .strict-spec-driven/.
