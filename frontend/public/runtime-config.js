// open spec: docker-runtime-config
// 运行时配置覆盖：Docker 容器启动时可通过挂载本文件覆盖 build 时的 VITE_* 配置。
// 这个文件在 dist 产物里位于根目录，可被 nginx/apache 在容器启动时通过 volume 挂载覆盖。
//
// 用法示例（docker run）：
//   -v /host/path/runtime-config.js:/usr/share/nginx/html/runtime-config.js:ro
//
// 本文件默认值（如果容器里没有挂载覆盖）：所有配置与 build 时一致。
window.__RUNTIME_CONFIG__ = {
  // VITE_SLASH_SKILL_INVOCATION: 'true',
  // VITE_API_URL: '/',
  // VITE_AGENT_URL: '/',
};