---
name: hello-world
description: A demo skill used to verify that the agent can discover, load, and follow SKILL.md instructions on demand.
compat_tool_hint: "与【可用工具】一致：XML <tool_call><name>skill_hello_world</name><arguments>{\"input\":\"加载理由\"}</arguments></tool_call>，或 ```json 块内 {\"name\":\"skill_hello_world\",\"arguments\":{\"input\":\"…\"}}。"
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
