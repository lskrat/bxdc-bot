const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

test("loadGatewayExtendedTools loads enabled EXTENSION tools", async () => {
  const originalGet = axios.get;
  const originalPost = axios.post;

  axios.get = async () => ({
    data: [
      {
        id: 1,
        name: "获取时间",
        description: "获取当前时间",
        type: "EXTENSION",
        executionMode: "CONFIG",
        enabled: true,
        configuration: JSON.stringify({
          kind: "time",
          operation: "current-time",
          endpoint: "https://vv.video.qq.com/checktime?otype=json",
        }),
      },
      {
        id: 2,
        name: "Disabled Skill",
        description: "should be ignored",
        type: "EXTENSION",
        executionMode: "CONFIG",
        enabled: false,
        configuration: "{}",
      },
    ],
  });

  axios.post = async () => ({
    data: 'QZOutputJson={"t":"1773013121"};',
  });

  try {
    const { loadGatewayExtendedTools } = require("../dist/tools/java-skills");
    const tools = await loadGatewayExtendedTools("http://localhost:18080", "test-token");

    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "extended_skill_1");
    const result = await tools[0].func("{}");
    const parsed = JSON.parse(result);
    assert.equal(parsed.timestamp, 1773013121);
    assert.ok(typeof parsed.readableTime === "string");
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
  }
});

test("configured API extended skill builds query and proxies request", async () => {
  const originalGet = axios.get;
  const originalPost = axios.post;

  axios.get = async () => ({
    data: [
      {
        id: 3,
        name: "获取笑话列表",
        description: "获取笑话内容列表",
        type: "EXTENSION",
        executionMode: "CONFIG",
        enabled: true,
        configuration: JSON.stringify({
          kind: "api",
          operation: "juhe-joke-list",
          method: "GET",
          endpoint: "http://v.juhe.cn/joke/content/list",
          query: {
            sort: "desc",
            page: 1,
            pagesize: 1,
          },
        }),
      },
    ],
  });

  let capturedRequest = null;
  axios.post = async (_url, body) => {
    capturedRequest = body;
    return {
      data: {
        error_code: 0,
        reason: "Success",
        result: {
          data: [
            { content: "joke" },
          ],
        },
      },
    };
  };

  try {
    const { loadGatewayExtendedTools } = require("../dist/tools/java-skills");
    const tools = await loadGatewayExtendedTools("http://localhost:18080", "test-token");

    assert.equal(tools.length, 1);
    const result = await tools[0].func(JSON.stringify({ page: 2, pagesize: 3 }));
    const parsed = JSON.parse(result);
    assert.equal(parsed.error_code, 0);
    assert.equal(parsed.result.data[0].content, "joke");
    assert.ok(capturedRequest);
    assert.equal(capturedRequest.method, "GET");
    assert.equal(capturedRequest.body, "");

    const requestUrl = new URL(capturedRequest.url);
    assert.equal(requestUrl.origin + requestUrl.pathname, "http://v.juhe.cn/joke/content/list");
    assert.equal(requestUrl.searchParams.get("sort"), "desc");
    assert.equal(requestUrl.searchParams.get("page"), "2");
    assert.equal(requestUrl.searchParams.get("pagesize"), "3");
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
  }
});

test("configured API extended skill validates parameter contract", async () => {
  const originalGet = axios.get;
  const originalPost = axios.post;

  axios.get = async () => ({
    data: [
      {
        id: 4,
        name: "测试契约",
        description: "测试参数契约",
        type: "EXTENSION",
        executionMode: "CONFIG",
        enabled: true,
        configuration: JSON.stringify({
          kind: "api",
          operation: "test-contract",
          method: "POST",
          endpoint: "http://example.com/api",
          parameterContract: {
            type: "object",
            properties: {
              reqField: { type: "string", required: true },
              numField: { type: "number" },
              enumField: { type: "string", enum: ["A", "B"] },
              defField: { type: "string", default: "default_val" },
            },
          },
        }),
      },
    ],
  });

  let capturedRequest = null;
  axios.post = async (_url, body) => {
    capturedRequest = body;
    return { data: { ok: true } };
  };

  try {
    const { loadGatewayExtendedTools } = require("../dist/tools/java-skills");
    const tools = await loadGatewayExtendedTools("http://localhost:18080", "test-token");
    assert.equal(tools.length, 1);

    // 1. Missing required field
    let result = await tools[0].func(JSON.stringify({}));
    let parsed = JSON.parse(result);
    assert.equal(parsed.error, "Parameter validation failed");
    assert.ok(parsed.details.some(d => d.includes("Missing required parameter: 'reqField'")));
    assert.equal(capturedRequest, null);

    // 2. Type mismatch
    result = await tools[0].func(JSON.stringify({ reqField: "val", numField: "not_a_number" }));
    parsed = JSON.parse(result);
    assert.equal(parsed.error, "Parameter validation failed");
    assert.ok(parsed.details.some(d => d.includes("must be a number")));
    assert.equal(capturedRequest, null);

    // 3. Enum mismatch
    result = await tools[0].func(JSON.stringify({ reqField: "val", enumField: "C" }));
    parsed = JSON.parse(result);
    assert.equal(parsed.error, "Parameter validation failed");
    assert.ok(parsed.details.some(d => d.includes("must be one of")));
    assert.equal(capturedRequest, null);

    // 4. Success with default value applied
    result = await tools[0].func(JSON.stringify({ reqField: "val", enumField: "A" }));
    parsed = JSON.parse(result);
    assert.equal(parsed.ok, true);
    assert.ok(capturedRequest);
    assert.equal(capturedRequest.url, "http://example.com/api?reqField=val&enumField=A&defField=default_val");
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
  }
});

test("api skill generator creates and validates a generated API skill", async () => {
  const originalGet = axios.get;
  const originalPost = axios.post;
  const originalPut = axios.put;

  const postCalls = [];
  axios.get = async () => ({ data: [] });
  axios.post = async (url, body) => {
    postCalls.push({ url, body });

    if (url.endsWith("/api/skills")) {
      return {
        data: {
          id: 9,
          name: body.name,
          description: body.description,
          type: body.type,
          configuration: body.configuration,
          enabled: body.enabled,
          requiresConfirmation: body.requiresConfirmation,
        },
      };
    }

    if (url.endsWith("/api/skills/api")) {
      return {
        data: {
          ok: true,
          result: "pong",
        },
      };
    }

    throw new Error(`Unexpected POST ${url}`);
  };
  axios.put = async () => {
    throw new Error("PUT should not be called");
  };

  try {
    const { JavaSkillGeneratorTool } = require("../dist/tools/java-skills");
    const tool = new JavaSkillGeneratorTool("http://localhost:18080", "test-token");
    const result = await tool._call(JSON.stringify({
      rawDescription: "调用 ping 接口检测服务可用性",
      name: "Ping API",
      description: "调用 ping 接口验证服务是否存活",
      method: "GET",
      endpoint: "https://example.com/ping",
      query: { env: "test" },
      testInput: { query: { env: "prod" } },
      interfaceDescription: "Ping 接口说明",
      parameterContract: { type: "object", properties: {} },
    }));

    const parsed = JSON.parse(result);
    assert.equal(parsed.status, "VALIDATION_SUCCEEDED");
    assert.equal(parsed.saveAction, "created");
    assert.equal(parsed.skill.name, "Ping API");
    assert.equal(parsed.skill.configuration.kind, "api");
    assert.equal(parsed.validation.success, true);
    assert.equal(postCalls.length, 2);
    assert.equal(postCalls[0].url, "http://localhost:18080/api/skills");
    assert.equal(postCalls[1].url, "http://localhost:18080/api/skills/api");
    assert.equal(postCalls[1].body.method, "GET");

    const requestUrl = new URL(postCalls[1].body.url);
    assert.equal(requestUrl.origin + requestUrl.pathname, "https://example.com/ping");
    assert.equal(requestUrl.searchParams.get("env"), "prod");
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
    axios.put = originalPut;
  }
});

test("api skill generator reports missing required fields", async () => {
  const { JavaSkillGeneratorTool } = require("../dist/tools/java-skills");
  const tool = new JavaSkillGeneratorTool("http://localhost:18080", "test-token");

  const result = await tool._call(JSON.stringify({
    rawDescription: "调用某个接口",
    endpoint: "https://example.com/demo",
  }));
  const parsed = JSON.parse(result);

  assert.equal(parsed.status, "INPUT_INCOMPLETE");
  assert.deepEqual(parsed.missingFields.sort(), ["interfaceDescription", "method", "parameterContract"].sort());
});

test("api skill generator updates existing skill when overwrite is enabled", async () => {
  const originalGet = axios.get;
  const originalPost = axios.post;
  const originalPut = axios.put;

  axios.get = async () => ({
    data: [
      {
        id: 12,
        name: "Ping API",
        description: "old",
        type: "EXTENSION",
        executionMode: "CONFIG",
        configuration: "{}",
        enabled: true,
        requiresConfirmation: false,
      },
    ],
  });
  axios.post = async (url) => {
    if (url.endsWith("/api/skills/api")) {
      return { data: { ok: true } };
    }
    throw new Error(`Unexpected POST ${url}`);
  };

  let putCall = null;
  axios.put = async (url, body) => {
    putCall = { url, body };
    return {
      data: {
        id: 12,
        name: body.name,
        description: body.description,
        type: body.type,
        configuration: body.configuration,
        enabled: body.enabled,
        requiresConfirmation: body.requiresConfirmation,
      },
    };
  };

  try {
    const { JavaSkillGeneratorTool } = require("../dist/tools/java-skills");
    const tool = new JavaSkillGeneratorTool("http://localhost:18080", "test-token");
    const result = await tool._call(JSON.stringify({
      name: "Ping API",
      method: "GET",
      endpoint: "https://example.com/ping",
      allowOverwrite: true,
      interfaceDescription: "desc",
      parameterContract: {},
    }));
    const parsed = JSON.parse(result);

    assert.equal(parsed.status, "VALIDATION_SUCCEEDED");
    assert.equal(parsed.saveAction, "updated");
    assert.ok(putCall);
    assert.equal(putCall.url, "http://localhost:18080/api/skills/12");
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
    axios.put = originalPut;
  }
});

test("openclaw skill executes allowed tools serially", async () => {
  const originalGet = axios.get;
  const originalPost = axios.post;

  axios.get = async () => ({
    data: [
      {
        id: 1,
        name: "获取时间",
        description: "获取当前时间",
        type: "EXTENSION",
        executionMode: "CONFIG",
        enabled: true,
        configuration: JSON.stringify({
          kind: "time",
          operation: "current-time",
          endpoint: "https://vv.video.qq.com/checktime?otype=json",
        }),
      },
      {
        id: 2,
        name: "查询距离生日还有几天",
        description: "自主规划技能",
        type: "EXTENSION",
        executionMode: "OPENCLAW",
        enabled: true,
        configuration: JSON.stringify({
          kind: "openclaw",
          systemPrompt: "先查时间，再做计算。",
          allowedTools: ["获取时间", "compute"],
          orchestration: { mode: "serial" },
        }),
      },
    ],
  });

  axios.post = async (url, body) => {
    if (url.endsWith("/api/skills/api")) {
      return { data: 'QZOutputJson={"t":"1773013121"};' };
    }
    if (url.endsWith("/api/skills/compute")) {
      assert.equal(body.operation, "date_diff_days");
      return { data: { result: 4 } };
    }
    throw new Error(`Unexpected POST ${url}`);
  };

  const fakePlannerModel = {
    bindTools(tools) {
      let step = 0;
      return {
        invoke: async () => {
          if (step === 0) {
            step += 1;
            return {
              tool_calls: [{ id: "tool-1", name: tools[0].name, args: {} }],
            };
          }
          if (step === 1) {
            step += 1;
            return {
              tool_calls: [
                {
                  id: "tool-2",
                  name: "compute",
                  args: { operation: "date_diff_days", operands: ["2026-03-08", "2026-03-12"] },
                },
              ],
            };
          }
          return { content: "距离下一次生日还有 4 天" };
        },
      };
    },
  };

  try {
    const { loadGatewayExtendedTools } = require("../dist/tools/java-skills");
    const { DynamicTool } = require("@langchain/core/tools");
    const computeTool = new DynamicTool({
      name: "compute",
      description: "compute days",
      func: async (input) => {
        const payload = JSON.parse(input);
        const response = await axios.post("http://localhost:18080/api/skills/compute", payload);
        return JSON.stringify(response.data);
      },
    });

    const tools = await loadGatewayExtendedTools("http://localhost:18080", "test-token", undefined, {
      plannerModel: fakePlannerModel,
      availableTools: [computeTool],
    });

    assert.equal(tools.length, 2);
    const birthdayTool = tools.find((tool) => tool.name === "extended_skill_2");
    assert.ok(birthdayTool);
    const result = await birthdayTool.func("我的生日是 3 月 12 日");
    assert.equal(result, "距离下一次生日还有 4 天");
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
  }
});

test("openclaw skill returns clarification when birthday is ambiguous", async () => {
  const originalGet = axios.get;

  axios.get = async () => ({
    data: [
      {
        id: 2,
        name: "查询距离生日还有几天",
        description: "自主规划技能",
        type: "EXTENSION",
        executionMode: "OPENCLAW",
        enabled: true,
        configuration: JSON.stringify({
          kind: "openclaw",
          systemPrompt: "无法解析时要求澄清。",
          allowedTools: ["获取时间", "compute"],
          orchestration: { mode: "serial" },
        }),
      },
    ],
  });

  const fakePlannerModel = {
    bindTools() {
      return {
        invoke: async () => ({ content: "请告诉我你的生日具体是哪一天，例如 3 月 12 日。" }),
      };
    },
  };

  try {
    const { loadGatewayExtendedTools } = require("../dist/tools/java-skills");
    const { DynamicTool } = require("@langchain/core/tools");
    const placeholderTimeTool = new DynamicTool({
      name: "extended_skill_1",
      description: "time placeholder",
      func: async () => JSON.stringify({ readableTime: "2026-03-08T00:00:00.000Z" }),
    });
    const computeTool = new DynamicTool({
      name: "compute",
      description: "compute placeholder",
      func: async () => JSON.stringify({ result: 0 }),
    });
    const tools = await loadGatewayExtendedTools("http://localhost:18080", "test-token", undefined, {
      plannerModel: fakePlannerModel,
      availableTools: [placeholderTimeTool, computeTool],
    });

    const birthdayTool = tools[0];
    const result = await birthdayTool.func("我生日快到了");
    assert.equal(result, "请告诉我你的生日具体是哪一天，例如 3 月 12 日。");
  } finally {
    axios.get = originalGet;
  }
});

test("openclaw skill can answer with prompt only and no allowed tools", async () => {
  const originalGet = axios.get;

  axios.get = async () => ({
    data: [
      {
        id: 9,
        name: "纯提示词技能",
        description: "不依赖任何工具",
        type: "EXTENSION",
        executionMode: "OPENCLAW",
        enabled: true,
        configuration: JSON.stringify({
          kind: "openclaw",
          systemPrompt: "只根据提示词回答，不调用工具。",
          allowedTools: [],
          orchestration: { mode: "serial" },
        }),
      },
    ],
  });

  const fakePlannerModel = {
    invoke: async (messages) => {
      assert.equal(messages[0].role, "system");
      assert.match(messages[0].content, /只根据提示词回答/);
      return { content: "这是一个纯提示词 skill 的回答。" };
    },
  };

  try {
    const { loadGatewayExtendedTools } = require("../dist/tools/java-skills");
    const tools = await loadGatewayExtendedTools("http://localhost:18080", "test-token", undefined, {
      plannerModel: fakePlannerModel,
      availableTools: [],
    });

    assert.equal(tools.length, 1);
    const result = await tools[0].func("请自我介绍");
    assert.equal(result, "这是一个纯提示词 skill 的回答。");
  } finally {
    axios.get = originalGet;
  }
});

test("openclaw skill can return next birthday result after current year passed", async () => {
  const originalGet = axios.get;
  const originalPost = axios.post;

  axios.get = async () => ({
    data: [
      {
        id: 1,
        name: "获取时间",
        description: "获取当前时间",
        type: "EXTENSION",
        executionMode: "CONFIG",
        enabled: true,
        configuration: JSON.stringify({
          kind: "time",
          operation: "current-time",
          endpoint: "https://vv.video.qq.com/checktime?otype=json",
        }),
      },
      {
        id: 2,
        name: "查询距离生日还有几天",
        description: "自主规划技能",
        type: "EXTENSION",
        executionMode: "OPENCLAW",
        enabled: true,
        configuration: JSON.stringify({
          kind: "openclaw",
          systemPrompt: "先查时间，再做计算。",
          allowedTools: ["获取时间", "compute"],
          orchestration: { mode: "serial" },
        }),
      },
    ],
  });

  axios.post = async (url, body) => {
    if (url.endsWith("/api/skills/api")) {
      return { data: 'QZOutputJson={"t":"1774915200"};' };
    }
    if (url.endsWith("/api/skills/compute")) {
      assert.equal(body.operation, "date_diff_days");
      assert.deepEqual(body.operands, ["2026-04-01", "2027-03-12"]);
      return { data: { result: 345 } };
    }
    throw new Error(`Unexpected POST ${url}`);
  };

  const fakePlannerModel = {
    bindTools(tools) {
      let step = 0;
      return {
        invoke: async () => {
          if (step === 0) {
            step += 1;
            return {
              tool_calls: [{ id: "tool-1", name: tools[0].name, args: {} }],
            };
          }
          if (step === 1) {
            step += 1;
            return {
              tool_calls: [
                {
                  id: "tool-2",
                  name: "compute",
                  args: { operation: "date_diff_days", operands: ["2026-04-01", "2027-03-12"] },
                },
              ],
            };
          }
          return { content: "你距离下一次生日还有 345 天" };
        },
      };
    },
  };

  try {
    const { loadGatewayExtendedTools } = require("../dist/tools/java-skills");
    const { DynamicTool } = require("@langchain/core/tools");
    const computeTool = new DynamicTool({
      name: "compute",
      description: "compute days",
      func: async (input) => {
        const payload = JSON.parse(input);
        const response = await axios.post("http://localhost:18080/api/skills/compute", payload);
        return JSON.stringify(response.data);
      },
    });

    const tools = await loadGatewayExtendedTools("http://localhost:18080", "test-token", undefined, {
      plannerModel: fakePlannerModel,
      availableTools: [computeTool],
    });

    const birthdayTool = tools.find((tool) => tool.name === "extended_skill_2");
    assert.ok(birthdayTool);
    const result = await birthdayTool.func("我生日是 3 月 12 日");
    assert.equal(result, "你距离下一次生日还有 345 天");
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
  }
});

test("skill generator creates an SSH skill", async () => {
  const originalGet = axios.get;
  const originalPost = axios.post;

  const postCalls = [];
  axios.get = async () => ({ data: [] });
  axios.post = async (url, body) => {
    postCalls.push({ url, body });
    if (url.endsWith("/api/skills")) {
      return {
        data: {
          id: 14,
          name: body.name,
          description: body.description,
          type: body.type,
          configuration: body.configuration,
          enabled: body.enabled,
          requiresConfirmation: body.requiresConfirmation,
        },
      };
    }
    throw new Error(`Unexpected POST ${url}`);
  };

  try {
    const { JavaSkillGeneratorTool } = require("../dist/tools/java-skills");
    const tool = new JavaSkillGeneratorTool("http://localhost:18080", "test-token");
    const result = await tool._call(JSON.stringify({
      targetType: "ssh",
      name: "Restart Nginx",
      command: "systemctl restart nginx",
    }));

    const parsed = JSON.parse(result);
    assert.equal(parsed.status, "VALIDATION_SUCCEEDED");
    assert.equal(parsed.saveAction, "created");
    assert.equal(parsed.skill.name, "Restart Nginx");
    assert.equal(parsed.skill.configuration.kind, "ssh");
    assert.equal(parsed.skill.configuration.preset, "server-resource-status");
    assert.equal(parsed.skill.configuration.operation, "server-resource-status");
    assert.equal(parsed.skill.configuration.lookup, "server_lookup");
    assert.equal(parsed.skill.configuration.executor, "ssh_executor");
    assert.equal(parsed.skill.configuration.command, "systemctl restart nginx");
    assert.equal(postCalls.length, 1);
    assert.equal(postCalls[0].url, "http://localhost:18080/api/skills");
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
  }
});

test("skill generator creates an OPENCLAW skill", async () => {
  const originalGet = axios.get;
  const originalPost = axios.post;

  const postCalls = [];
  axios.get = async () => ({ data: [] });
  axios.post = async (url, body) => {
    postCalls.push({ url, body });
    if (url.endsWith("/api/skills")) {
      return {
        data: {
          id: 15,
          name: body.name,
          description: body.description,
          type: body.type,
          executionMode: body.executionMode,
          configuration: body.configuration,
          enabled: body.enabled,
          requiresConfirmation: body.requiresConfirmation,
        },
      };
    }
    throw new Error(`Unexpected POST ${url}`);
  };

  try {
    const { JavaSkillGeneratorTool } = require("../dist/tools/java-skills");
    const tool = new JavaSkillGeneratorTool("http://localhost:18080", "test-token");
    const result = await tool._call(JSON.stringify({
      targetType: "openclaw",
      name: "Smart Assistant",
      systemPrompt: "You are a smart assistant.",
      allowedTools: ["tool1", "tool2"],
    }));

    const parsed = JSON.parse(result);
    assert.equal(parsed.status, "VALIDATION_SUCCEEDED");
    assert.equal(parsed.saveAction, "created");
    assert.equal(parsed.skill.name, "Smart Assistant");
    assert.equal(parsed.skill.type, "EXTENSION");
    assert.equal(parsed.skill.configuration.systemPrompt, "You are a smart assistant.");
    assert.deepEqual(parsed.skill.configuration.allowedTools, ["tool1", "tool2"]);
    assert.equal(postCalls.length, 1);
    assert.equal(postCalls[0].body.executionMode, "OPENCLAW");
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
  }
});
test("skill generator keeps saved skill when validation fails", async () => {
  const originalGet = axios.get;
  const originalPost = axios.post;
  const originalPut = axios.put;

  axios.get = async () => ({ data: [] });
  axios.post = async (url, body) => {
    if (url.endsWith("/api/skills")) {
      return {
        data: {
          id: 13,
          name: body.name,
          description: body.description,
          type: body.type,
          configuration: body.configuration,
          enabled: body.enabled,
          requiresConfirmation: body.requiresConfirmation,
        },
      };
    }

    if (url.endsWith("/api/skills/api")) {
      return {
        data: {
          error: "401 unauthorized",
        },
      };
    }

    throw new Error(`Unexpected POST ${url}`);
  };
  axios.put = async () => {
    throw new Error("PUT should not be called");
  };

  try {
    const { JavaSkillGeneratorTool } = require("../dist/tools/java-skills");
    const tool = new JavaSkillGeneratorTool("http://localhost:18080", "test-token");
    const result = await tool._call(JSON.stringify({
      name: "Failing API",
      method: "GET",
      endpoint: "https://example.com/protected",
      interfaceDescription: "A failing API",
      parameterContract: { type: "object", properties: {} },
    }));
    const parsed = JSON.parse(result);

    assert.equal(parsed.status, "VALIDATION_FAILED");
    assert.equal(parsed.saveAction, "created");
    assert.equal(parsed.validation.success, false);
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
    axios.put = originalPut;
  }
});
