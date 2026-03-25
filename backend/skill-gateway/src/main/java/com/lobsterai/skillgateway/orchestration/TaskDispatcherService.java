package com.lobsterai.skillgateway.orchestration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

/**
 * 任务分发服务。
 * <p>
 * 负责将用户指令封装为任务，并通过 HTTP 请求分发给 Agent Core 服务。
 * </p>
 */
@Service
public class TaskDispatcherService {

    private final WebClient webClient;

    public TaskDispatcherService(
            WebClient.Builder webClientBuilder,
            @Value("${agent.core.url:http://localhost:3000}") String agentCoreUrl
    ) {
        this.webClient = webClientBuilder.baseUrl(agentCoreUrl).build();
    }

    /**
     * 分发任务并获取 SSE 流。
     *
     * @param instruction 用户指令
     * @param context     上下文信息
     * @param history     历史对话
     * @return 包含 Agent 执行状态的 Flux 流
     */
    public Flux<String> dispatchTask(String instruction, Object context, Object history) {
        return webClient.post()
                .uri("/agent/run")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new TaskRequest(instruction, context, history))
                .retrieve()
                .bodyToFlux(String.class); // SSE stream
    }

    /**
     * 任务请求数据传输对象。
     */
    public static class TaskRequest {
        public String instruction;
        public Object context;
        public Object history;
        public TaskRequest(String instruction, Object context, Object history) {
            this.instruction = instruction;
            this.context = context;
            this.history = history;
        }
    }
}
