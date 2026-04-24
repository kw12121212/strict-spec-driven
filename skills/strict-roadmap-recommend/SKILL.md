---
name: strict-roadmap-recommend
description: Strict skill package metadata scaffold for strict-roadmap-recommend.
metadata:
  skill_id: strict_roadmap_recommend
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-roadmap-recommend

## This Skill's Commands


```yaml
list-changes: node {{SKILL_DIR}}/scripts/strict-spec-driven.js list
inspect-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
propose-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js propose <change-name>
```

## Prerequisites

Use strict workflow artifacts under .strict-spec-driven/.
