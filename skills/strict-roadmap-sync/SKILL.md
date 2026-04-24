---
name: strict-roadmap-sync
description: Strict skill package metadata scaffold for strict-roadmap-sync.
metadata:
  skill_id: strict_roadmap_sync
  author: strict-spec-driven
  type: agent_skill
  version: 1.0.0
---

# strict-roadmap-sync

## This Skill's Commands


```yaml
list-changes: node {{SKILL_DIR}}/scripts/strict-spec-driven.js list
inspect-change: node {{SKILL_DIR}}/scripts/strict-spec-driven.js modify [change-name|archive-dir]
```

## Prerequisites

Use strict workflow artifacts under .strict-spec-driven/.
