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
          apiKeyField: "key",
          apiKey: "test-key",
          autoTimestampField: "time",
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
    assert.equal(requestUrl.searchParams.get("key"), "test-key");
    assert.ok(requestUrl.searchParams.get("time"));
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
    const { JavaApiSkillGeneratorTool } = require("../dist/tools/java-skills");
    const tool = new JavaApiSkillGeneratorTool("http://localhost:18080", "test-token");
    const result = await tool._call(JSON.stringify({
      rawDescription: "调用 ping 接口检测服务可用性",
      name: "Ping API",
      description: "调用 ping 接口验证服务是否存活",
      method: "GET",
      endpoint: "https://example.com/ping",
      query: { env: "test" },
      testInput: { query: { env: "prod" } },
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
  const { JavaApiSkillGeneratorTool } = require("../dist/tools/java-skills");
  const tool = new JavaApiSkillGeneratorTool("http://localhost:18080", "test-token");

  const result = await tool._call(JSON.stringify({
    rawDescription: "调用某个接口",
    endpoint: "https://example.com/demo",
  }));
  const parsed = JSON.parse(result);

  assert.equal(parsed.status, "INPUT_INCOMPLETE");
  assert.deepEqual(parsed.missingFields, ["method"]);
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
    const { JavaApiSkillGeneratorTool } = require("../dist/tools/java-skills");
    const tool = new JavaApiSkillGeneratorTool("http://localhost:18080", "test-token");
    const result = await tool._call(JSON.stringify({
      name: "Ping API",
      method: "GET",
      endpoint: "https://example.com/ping",
      allowOverwrite: true,
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

test("api skill generator keeps saved skill when validation fails", async () => {
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
    const { JavaApiSkillGeneratorTool } = require("../dist/tools/java-skills");
    const tool = new JavaApiSkillGeneratorTool("http://localhost:18080", "test-token");
    const result = await tool._call(JSON.stringify({
      name: "Failing API",
      method: "GET",
      endpoint: "https://example.com/protected",
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
