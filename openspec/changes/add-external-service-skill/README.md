# add-external-service-skill

新增 kind=external Skill 类型：让 LLM 可调用任意外部 HTTP 服务（天气查询/股票/脚本执行/飞书通知等）。主表 external_service 存第三方接入信息（URL/方法/auth_config JSON/响应格式/重试），子表 external_service_input 存第三方入参契约（admin 配一次，所有引用 Skill 共享）。Skill 配置极简 {kind, serviceName, interfaceDescription}，Skill 创建页直接按子表行渲染 textarea。零 agent-core 改动、零新依赖、零新环境变量。
