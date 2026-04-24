---
name: strict-spec-ship
description: Strict skill package metadata scaffold for strict-spec-ship.
metadata:
  skill_id: strict_spec_ship
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-spec-ship

## This Skill's Commands


```yaml
inspect-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
verify-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify <change-name>
review-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js review <change-name>
verify-spec-mappings: node {{SKILL_DIR}}/scripts/strict-spec-driven.js verify-spec-mappings
archive-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js archive <change-name>
```

## Prerequisites

Use strict workflow artifacts under .strict-spec-driven/.
