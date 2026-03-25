package com.lobsterai.skillgateway.controller;

import com.lobsterai.skillgateway.orchestration.AgentStreamConsumer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.Disposable;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/tasks")
@CrossOrigin(origins = "*")
public class TaskController {

    private final AgentStreamConsumer agentStreamConsumer;
    // In-memory storage for task instructions. In production, use a database or cache.
    private final Map<String, TaskContext> taskContexts = new ConcurrentHashMap<>();
    // Store active subscriptions to cancel them if needed
    private final Map<String, Disposable> activeSubscriptions = new ConcurrentHashMap<>();

    public TaskController(AgentStreamConsumer agentStreamConsumer) {
        this.agentStreamConsumer = agentStreamConsumer;
    }

    @PostMapping
    public ResponseEntity<CreateTaskResponse> createTask(@RequestBody CreateTaskRequest request) {
        String taskId = UUID.randomUUID().toString();
        taskContexts.put(taskId, new TaskContext(request.getContent(), request.getUserId(), request.getHistory()));
        return ResponseEntity.ok(new CreateTaskResponse(taskId));
    }

    @GetMapping(value = "/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamTaskEvents(@PathVariable String id) {
        TaskContext context = taskContexts.get(id);
        if (context == null) {
            SseEmitter emitter = new SseEmitter(0L); 
            try {
                emitter.send(SseEmitter.event().name("error").data("Task not found"));
                emitter.complete();
            } catch (IOException e) {
                // ignore
            }
            return emitter;
        }

        SseEmitter emitter = new SseEmitter(0L); // No timeout
        
        Map<String, Object> executionContext = new HashMap<>();
        if (context.getUserId() != null) {
            executionContext.put("userId", context.getUserId());
        }
        executionContext.put("sessionId", id);

        Disposable subscription = agentStreamConsumer.executeAndStream(context.getContent(), executionContext, context.getHistory())
            .subscribe(
                data -> {
                    try {
                        emitter.send(SseEmitter.event().data(data));
                    } catch (IOException e) {
                        emitter.completeWithError(e);
                    }
                },
                error -> {
                    try {
                        emitter.send(SseEmitter.event().name("error").data(error.getMessage()));
                        emitter.completeWithError(error);
                    } catch (IOException e) {
                        // ignore
                    }
                    activeSubscriptions.remove(id);
                },
                () -> {
                    try {
                        emitter.send(SseEmitter.event().name("complete").data(""));
                    } catch (IOException e) {
                        // ignore
                    }
                    emitter.complete();
                    activeSubscriptions.remove(id);
                }
            );

        activeSubscriptions.put(id, subscription);
        
        emitter.onCompletion(() -> {
            Disposable s = activeSubscriptions.remove(id);
            if (s != null && !s.isDisposed()) {
                s.dispose();
            }
        });
        
        emitter.onTimeout(() -> {
            emitter.complete();
            Disposable s = activeSubscriptions.remove(id);
            if (s != null && !s.isDisposed()) {
                s.dispose();
            }
        });

        return emitter;
    }

    public static class CreateTaskRequest {
        private String content;
        private String userId;
        private java.util.List<Map<String, Object>> history;

        public String getContent() {
            return content;
        }

        public void setContent(String content) {
            this.content = content;
        }

        public String getUserId() {
            return userId;
        }

        public void setUserId(String userId) {
            this.userId = userId;
        }

        public java.util.List<Map<String, Object>> getHistory() {
            return history;
        }

        public void setHistory(java.util.List<Map<String, Object>> history) {
            this.history = history;
        }
    }

    public static class CreateTaskResponse {
        private String id;

        public CreateTaskResponse(String id) {
            this.id = id;
        }

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }
    }

    private static class TaskContext {
        private final String content;
        private final String userId;
        private final java.util.List<Map<String, Object>> history;

        public TaskContext(String content, String userId, java.util.List<Map<String, Object>> history) {
            this.content = content;
            this.userId = userId;
            this.history = history;
        }

        public String getContent() {
            return content;
        }

        public String getUserId() {
            return userId;
        }

        public java.util.List<Map<String, Object>> getHistory() {
            return history;
        }
    }
}
