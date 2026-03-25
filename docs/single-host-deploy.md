# Fishtank Single-Host Deployment

本文是一份完整的三服务部署说明书，目标是在同一台 Linux 服务器上部署：

- `frontend`
- `skill-gateway`
- `agent-core`

并通过统一域名对外提供服务。

## 架构说明

推荐拓扑如下：

- `nginx`：对外提供 `80/443`
- `frontend`：构建为静态文件，由 `nginx` 直接托管
- `skill-gateway`：监听 `127.0.0.1:18080`
- `agent-core`：监听 `127.0.0.1:3000`
- `mem0`：监听 `127.0.0.1:8001`，或使用远程服务地址

建议浏览器始终只访问同一个域名：

- `https://your-domain.example.com/` -> 前端页面
- `https://your-domain.example.com/api/` -> `skill-gateway`
- `https://your-domain.example.com/features/` -> `agent-core`

服务调用关系：

- 浏览器 -> `nginx`
- `nginx /api/*` -> `skill-gateway`
- `nginx /features/*` -> `agent-core`
- `skill-gateway` -> `agent-core`
- `agent-core` -> `mem0`
- `agent-core` -> 大模型 API

## 前置条件

服务器建议准备以下运行时：

- `nginx`
- `Node.js 18+`
- `Java 17`
- 可选：`systemd`

如果服务器无法访问公网依赖源，请在有网环境完成打包后上传产物。

## 目录规划建议

建议部署目录如下：

```text
/opt/fishtank/
  frontend/
    dist/
  agent-core/
    dist/
    node_modules/
    package.json
    package-lock.json
    SKILLs/
    .env
  skill-gateway/
    skill-gateway-0.0.1-SNAPSHOT.jar
    application-prod.properties
  data/
    fishtank_db.mv.db
```

## 配置文件

### frontend

复制 `frontend/.env.production.example` 为 `frontend/.env.production`：

```env
VITE_API_URL=https://your-domain.example.com
VITE_AGENT_URL=https://your-domain.example.com
```

说明：

- `VITE_API_URL`：前端访问 `skill-gateway` 的统一入口
- `VITE_AGENT_URL`：前端访问 `agent-core` 的统一入口

如果你使用同域反向代理，这两个值都填同一个域名即可。

### agent-core

复制 `backend/agent-core/.env.example` 为 `backend/agent-core/.env`：

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

OPENAI_API_KEY=your-openai-compatible-key
OPENAI_MODEL_NAME=gpt-4o-mini
OPENAI_API_BASE=https://api.openai.com/v1

JAVA_GATEWAY_URL=http://127.0.0.1:18080
JAVA_GATEWAY_TOKEN=your-java-gateway-token

MEM0_URL=http://127.0.0.1:8001
```

说明：

- `HOST` / `PORT`：`agent-core` 监听地址和端口
- `OPENAI_API_KEY`：大模型密钥
- `OPENAI_MODEL_NAME`：模型名，例如 `gpt-4o-mini`、`deepseek-chat`
- `OPENAI_API_BASE`：OpenAI 兼容接口地址
- `JAVA_GATEWAY_URL`：指向 `skill-gateway`
- `JAVA_GATEWAY_TOKEN`：与 `skill-gateway` 中要求的 token 保持一致
- `MEM0_URL`：记忆服务地址

### skill-gateway

复制 `backend/skill-gateway/src/main/resources/application-prod.example.properties` 为服务器上的 `application-prod.properties`：

```properties
spring.datasource.url=jdbc:h2:file:/opt/fishtank/data/fishtank_db;DB_CLOSE_DELAY=-1
spring.datasource.driverClassName=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=change-this-password
spring.sql.init.mode=always
spring.jpa.database-platform=org.hibernate.dialect.H2Dialect
spring.h2.console.enabled=false
spring.jpa.hibernate.ddl-auto=update

server.address=127.0.0.1
server.port=18080

agent.core.url=http://127.0.0.1:3000
app.cors.allowed-origins=https://your-domain.example.com
```

说明：

- `server.address` / `server.port`：`skill-gateway` 监听地址和端口
- `agent.core.url`：`skill-gateway` 调用 `agent-core` 的地址
- `app.cors.allowed-origins`：允许前端访问的域名，支持逗号分隔多个值
- `spring.datasource.*`：本地 H2 数据库配置

## 打包步骤

### 1. 打包 frontend

在有网环境执行：

```bash
cd frontend
npm ci
npm run build
```

构建完成后，会生成：

- `frontend/dist/`

将整个 `dist/` 目录上传到服务器，例如：

- `/opt/fishtank/frontend/dist`

### 2. 打包 agent-core

在有网环境执行：

```bash
cd backend/agent-core
npm ci
npm run build
```

上传以下内容到服务器，例如 `/opt/fishtank/agent-core/`：

- `dist/`
- `node_modules/`
- `package.json`
- `package-lock.json`
- `SKILLs/`
- `.env`

说明：

- 如果目标机是 Linux，请尽量在 Linux 环境打包 `node_modules`
- 不建议在 macOS 上安装依赖后直接复制到 Linux 使用

### 3. 打包 skill-gateway

在有网环境执行：

```bash
cd backend/skill-gateway
mvn -DskipTests package
```

上传：

- `target/skill-gateway-0.0.1-SNAPSHOT.jar`
- `application-prod.properties`

## 启动步骤

建议启动顺序：

1. 启动 `mem0`
2. 启动 `agent-core`
3. 启动 `skill-gateway`
4. 配置并重载 `nginx`

### 启动 agent-core

```bash
cd /opt/fishtank/agent-core
node dist/main.js
```

### 启动 skill-gateway

```bash
cd /opt/fishtank/skill-gateway
java -jar skill-gateway-0.0.1-SNAPSHOT.jar --spring.config.location=/opt/fishtank/skill-gateway/application-prod.properties
```

### 配置 nginx

示例配置文件已经放在：

- `deploy/nginx/fishtank.single-host.conf`

核心配置如下：

```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    root /opt/fishtank/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:18080;
    }

    location /features/ {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

如果你已经准备好域名和证书，可以再补 `443 ssl` 配置。

## systemd 启动建议

示例文件已提供：

- `deploy/systemd/agent-core.service`
- `deploy/systemd/skill-gateway.service`

使用方式：

```bash
cp deploy/systemd/agent-core.service /etc/systemd/system/
cp deploy/systemd/skill-gateway.service /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now agent-core
systemctl enable --now skill-gateway
systemctl restart nginx
```

如果你的 `node` 或 `java` 不在 `/usr/bin/`，请先修改服务文件中的 `ExecStart`。

## 服务可用性测试

### agent-core 测试接口

本次已增加健康检查接口：

- `GET /health`

本机测试：

```bash
curl http://127.0.0.1:3000/health
```

预期返回类似：

```json
{
  "status": "ok",
  "service": "agent-core"
}
```

也可以测试一个现有业务接口：

- `POST /features/avatar/generate`

示例：

```bash
curl -X POST http://127.0.0.1:3000/features/avatar/generate \
  -H "Content-Type: application/json" \
  -d '{"nickname":"test"}'
```

### skill-gateway 测试接口

本次已增加健康检查接口：

- `GET /api/health`

本机测试：

```bash
curl http://127.0.0.1:18080/api/health
```

预期返回类似：

```json
{
  "status": "ok",
  "service": "skill-gateway"
}
```

也可以测试一个现有公开接口：

- `GET /api/skills`

示例：

```bash
curl http://127.0.0.1:18080/api/skills
```

### 前端测试

浏览器访问：

```text
https://your-domain.example.com/
```

检查：

- 页面能正常打开
- 注册/登录接口能访问
- 首页欢迎语可返回
- 聊天时 SSE 能正常建立

## 端口建议

推荐对外只开放：

- `80`
- `443`

推荐仅本机监听：

- `127.0.0.1:18080` for `skill-gateway`
- `127.0.0.1:3000` for `agent-core`
- `127.0.0.1:8001` for `mem0`

这样可以避免直接暴露内部服务端口。

## 常见问题

### `frontend` 可以打开，但请求都打到 `localhost`

说明前端构建时没有正确读取 `.env.production`，或仍在使用旧的构建产物。请重新执行：

```bash
cd frontend
npm run build
```

然后重新上传 `dist/`。

### `agent-core` 启动失败，提示找不到模块

通常是以下原因：

- `node_modules` 没有一起上传
- 工作目录不对
- 在错误的平台打包了依赖

### `skill-gateway` 能启动，但前端跨域失败

请检查：

- `app.cors.allowed-origins`
- `nginx` 访问域名
- 浏览器实际访问地址是否和配置一致

### `skill-gateway` 调不到 `agent-core`

请检查：

- `agent.core.url`
- `agent-core` 是否已启动
- `curl http://127.0.0.1:3000/health`

### `agent-core` 调不到大模型或 `mem0`

请检查：

- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `OPENAI_MODEL_NAME`
- `MEM0_URL`
- 服务器出网能力或目标服务连通性
