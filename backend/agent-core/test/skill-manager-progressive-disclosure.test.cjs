const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { SkillManager, MAX_COMPAT_TOOL_HINT_LENGTH } = require("../dist/skills/skill.manager");
const { formatToolsBlockForSystemPrompt } = require("../dist/utils/tool-prompt-compat");

function writeSkill(dir, yamlBody) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), yamlBody, "utf8");
}

function withSkillFixture(fn) {
  const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), "skill-cwd-"));
  const skillsHome = path.join(emptyCwd, "extra-skills");
  const prevCwd = process.cwd();
  const prevDirs = process.env.AGENT_SKILLS_DIRS;
  process.chdir(emptyCwd);
  process.env.AGENT_SKILLS_DIRS = skillsHome;

  try {
    fn(skillsHome);
  } finally {
    process.chdir(prevCwd);
    if (prevDirs === undefined) delete process.env.AGENT_SKILLS_DIRS;
    else process.env.AGENT_SKILLS_DIRS = prevDirs;
    fs.rmSync(emptyCwd, { recursive: true, force: true });
  }
}

async function withSkillFixtureAsync(fn) {
  const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), "skill-cwd-"));
  const skillsHome = path.join(emptyCwd, "extra-skills");
  const prevCwd = process.cwd();
  const prevDirs = process.env.AGENT_SKILLS_DIRS;
  process.chdir(emptyCwd);
  process.env.AGENT_SKILLS_DIRS = skillsHome;

  try {
    await fn(skillsHome);
  } finally {
    process.chdir(prevCwd);
    if (prevDirs === undefined) delete process.env.AGENT_SKILLS_DIRS;
    else process.env.AGENT_SKILLS_DIRS = prevDirs;
    fs.rmSync(emptyCwd, { recursive: true, force: true });
  }
}

test("compat_tool_hint appears in skill context and tool description when compat on", () => {
  const prevCompat = process.env.AGENT_TOOL_PROMPT_COMPAT;
  process.env.AGENT_TOOL_PROMPT_COMPAT = "true";

  try {
    withSkillFixture((skillsHome) => {
    writeSkill(
      path.join(skillsHome, "api-skill"),
      `---
name: api-skill
description: Calls an API with strict JSON.
compat_tool_hint: Use input as JSON string with keys a,b.
---

Body.
`,
    );

    const mgr = new SkillManager();
    const ctx = mgr.buildSkillPromptContext();
    assert.ok(ctx.includes("首轮要点：Use input as JSON string with keys a,b."));
    const tools = mgr.getLangChainTools();
    const t = tools.find((x) => x.name === "skill_api_skill");
    assert.ok(t);
    assert.ok(t.description.includes("Compat call hint: Use input as JSON string with keys a,b."));
    });
  } finally {
    if (prevCompat === undefined) delete process.env.AGENT_TOOL_PROMPT_COMPAT;
    else process.env.AGENT_TOOL_PROMPT_COMPAT = prevCompat;
  }
});

test("compat_tool_hint omitted from skill context when compat off", () => {
  const prevCompat = process.env.AGENT_TOOL_PROMPT_COMPAT;
  delete process.env.AGENT_TOOL_PROMPT_COMPAT;

  try {
    withSkillFixture((skillsHome) => {
    writeSkill(
      path.join(skillsHome, "x"),
      `---
name: x
description: d
compat_tool_hint: SECRET
---

Hi
`,
    );

    const mgr = new SkillManager();
    const ctx = mgr.buildSkillPromptContext();
    assert.ok(!ctx.includes("首轮要点"));
    assert.ok(!ctx.includes("SECRET"));
    const tools = mgr.getLangChainTools();
    const t = tools.find((tool) => tool.name === "skill_x");
    assert.ok(t);
    assert.ok(!t.description.includes("Compat call hint"));
    });
  } finally {
    if (prevCompat === undefined) delete process.env.AGENT_TOOL_PROMPT_COMPAT;
    else process.env.AGENT_TOOL_PROMPT_COMPAT = prevCompat;
  }
});

test("loaded skill tool result includes compat invocation reminder when compat on", async () => {
  const prevCompat = process.env.AGENT_TOOL_PROMPT_COMPAT;
  process.env.AGENT_TOOL_PROMPT_COMPAT = "true";

  try {
    await withSkillFixtureAsync(async (skillsHome) => {
      writeSkill(
        path.join(skillsHome, "rem-skill"),
        `---
name: rem-skill
description: d
---

Say to use function_call API only.
`,
      );

      const mgr = new SkillManager();
      const tools = mgr.getLangChainTools();
      const t = tools.find((x) => x.name === "skill_rem_skill");
      assert.ok(t);
      const out = await t.invoke("need this");
      assert.ok(typeof out === "string");
      assert.ok(out.includes("【兼容模式 · 工具调用（权威格式）】"));
      assert.ok(out.includes("<tool_call>"));
      assert.ok(out.includes("function_call"));
    });
  } finally {
    if (prevCompat === undefined) delete process.env.AGENT_TOOL_PROMPT_COMPAT;
    else process.env.AGENT_TOOL_PROMPT_COMPAT = prevCompat;
  }
});

test("loaded skill tool result omits compat reminder when compat off", async () => {
  const prevCompat = process.env.AGENT_TOOL_PROMPT_COMPAT;
  delete process.env.AGENT_TOOL_PROMPT_COMPAT;

  try {
    await withSkillFixtureAsync(async (skillsHome) => {
      writeSkill(
        path.join(skillsHome, "no-rem"),
        `---
name: no-rem
description: d
---

Body
`,
      );

      const mgr = new SkillManager();
      const tools = mgr.getLangChainTools();
      const t = tools.find((x) => x.name === "skill_no_rem");
      assert.ok(t);
      const out = await t.invoke("x");
      assert.ok(typeof out === "string");
      assert.ok(!out.includes("【兼容模式 · 工具调用（权威格式）】"));
    });
  } finally {
    if (prevCompat === undefined) delete process.env.AGENT_TOOL_PROMPT_COMPAT;
    else process.env.AGENT_TOOL_PROMPT_COMPAT = prevCompat;
  }
});

test("compat_tool_hint is truncated to MAX_COMPAT_TOOL_HINT_LENGTH", () => {
  const prevCompat = process.env.AGENT_TOOL_PROMPT_COMPAT;
  process.env.AGENT_TOOL_PROMPT_COMPAT = "true";
  const longHint = "Z".repeat(MAX_COMPAT_TOOL_HINT_LENGTH + 40);

  try {
    withSkillFixture((skillsHome) => {
    writeSkill(
      path.join(skillsHome, "long"),
      `---
name: long
description: d
compat_tool_hint: ${longHint}
---

Body
`,
    );

    const mgr = new SkillManager();
    const skill = mgr.listSkills().find((s) => s.id === "long");
    assert.ok(skill);
    assert.equal(skill.compatToolHint.length, MAX_COMPAT_TOOL_HINT_LENGTH);
    assert.ok(skill.compatToolHint.endsWith("…"));
    });
  } finally {
    if (prevCompat === undefined) delete process.env.AGENT_TOOL_PROMPT_COMPAT;
    else process.env.AGENT_TOOL_PROMPT_COMPAT = prevCompat;
  }
});

test("formatToolsBlockForSystemPrompt includes Compat call hint from skill tool description", () => {
  const prevCompat = process.env.AGENT_TOOL_PROMPT_COMPAT;
  process.env.AGENT_TOOL_PROMPT_COMPAT = "true";
  try {
    withSkillFixture((skillsHome) => {
      writeSkill(
        path.join(skillsHome, "hinted"),
        `---
name: hinted
description: d
compat_tool_hint: Always pass JSON.
---

x
`,
      );
      const mgr = new SkillManager();
      const t = mgr.getLangChainTools().find((x) => x.name === "skill_hinted");
      assert.ok(t);
      const block = formatToolsBlockForSystemPrompt([t]);
      assert.ok(block.includes("skill_hinted"));
      assert.ok(block.includes("Compat call hint: Always pass JSON."));
    });
  } finally {
    if (prevCompat === undefined) delete process.env.AGENT_TOOL_PROMPT_COMPAT;
    else process.env.AGENT_TOOL_PROMPT_COMPAT = prevCompat;
  }
});
