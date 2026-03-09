package com.lobsterai.skillgateway.orchestration;

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

    public TaskDispatcherService(WebClient.Builder webClientBuilder) {
        // Assuming agent-core is running on localhost:3000
        this.webClient = webClientBuilder.baseUrl("http://localhost:3000").build();
    }

    /**
     * 分发任务并获取 SSE 流。
     *
     * @param instruction 用户指令
     * @param context     上下文信息
     * @return 包含 Agent 执行状态的 Flux 流
     */
    public Flux<String> dispatchTask(String instruction, Object context) {
        return webClient.post()
                .uri("/agent/run")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(new TaskRequest(instruction, context))
                .retrieve()
                .bodyToFlux(String.class); // SSE stream
    }

    /**
     * 任务请求数据传输对象。
     */
    public static class TaskRequest {
        public String instruction;
        public Object context;
        public TaskRequest(String instruction, Object context) {
            this.instruction = instruction;
            this.context = context;
        }
    }
}
