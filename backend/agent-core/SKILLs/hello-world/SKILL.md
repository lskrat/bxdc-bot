---
name: hello-world
description: A demo skill used to verify that the agent can discover, load, and follow SKILL.md instructions on demand.
metadata:
  category: demo
  triggers:
    - hello world
    - test skill
    - verify skills
  author: local
  version: "1.0.0"
---

Use this skill when the user explicitly wants to test whether the skills system is working,
or when they ask for a simple hello-world style verification.

Behavior:
- Reply concisely.
- Confirm that the skill system has been loaded successfully.
- Include the exact phrase `Hello World from skill`.
- If the user asked for a reason, explain in one sentence that this response came from a SKILL.md-based skill.
