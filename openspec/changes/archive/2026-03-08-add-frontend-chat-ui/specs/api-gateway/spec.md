## 新增需求

### 需求：CORS 支持
API 网关必须支持前端应用程序的跨源资源共享 (CORS)。

#### 场景：开发环境
- **当**请求来自 `http://localhost:5173` (Vite 开发服务器) 时
- **那么**服务器响应 `Access-Control-Allow-Origin: http://localhost:5173`
- **并且**允许方法 `GET`, `POST`, `OPTIONS`
- **并且**允许头信息 `Content-Type`, `Authorization`

#### 场景：生产环境
- **当**请求来自配置的生产域时
- **那么**服务器响应相应的 `Access-Control-Allow-Origin` 头信息
