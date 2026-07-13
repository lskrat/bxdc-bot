package com.lobsterai.skillgateway.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * OpenAI Embeddings 服务（向量搜索核心）。
 *
 * <p>
 * 用途：为 system_skills 的 tool_name + description 生成 embedding，
 * 查询时计算余弦相似度返回最相关技能。
 * </p>
 *
 * <p>
 * 约束（AGENTS.md 5.1）：用 JDK 1.8 原生 HttpURLConnection，不新增第三方包。
 * </p>
 */
@Service
public class EmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);

    private static final int CONNECT_TIMEOUT = 5000;
    private static final int READ_TIMEOUT = 30000;

    private final ObjectMapper objectMapper;

    @Value("${app.embedding.api-base:}")
    private String defaultApiBase;

    @Value("${app.embedding.api-key:}")
    private String defaultApiKey;

    @Value("${app.embedding.model:text-embedding-3-small}")
    private String embeddingModel;

    @Autowired
    public EmbeddingService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 计算文本的 embedding 向量。
     *
     * @param text    待 embedding 的文本
     * @param apiBase OpenAI-compatible API base URL（如 "https://api.openai.com/v1"）
     * @param apiKey  API Key
     * @return float 数组；失败返回 null
     */
    public float[] embed(String text, String apiBase, String apiKey, String model) {
        if (text == null || text.trim().isEmpty()) return null;
        if (apiBase == null || apiBase.isEmpty()) return null;
        if (apiKey == null || apiKey.isEmpty()) return null;

        String urlStr = apiBase.endsWith("/") ? apiBase.substring(0, apiBase.length() - 1) : apiBase;
        urlStr = urlStr + "/embeddings";

        Map<String, Object> body = new HashMap<>();
        body.put("model", model != null && !model.isEmpty() ? model : "text-embedding-3-small");
        body.put("input", text);

        String bodyJson;
        try {
            bodyJson = objectMapper.writeValueAsString(body);
        } catch (Exception e) {
            log.error("[Embedding] Failed to serialize request: {}", e.getMessage());
            return null;
        }

        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(CONNECT_TIMEOUT);
            conn.setReadTimeout(READ_TIMEOUT);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);

            byte[] bodyBytes = bodyJson.getBytes(StandardCharsets.UTF_8);
            conn.setRequestProperty("Content-Length", String.valueOf(bodyBytes.length));
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bodyBytes);
                os.flush();
            }

            int status = conn.getResponseCode();
            if (status / 100 != 2) {
                String err = readResponse(conn, status);
                log.warn("[Embedding] HTTP {} from {}: {}", status, urlStr, truncate(err, 200));
                return null;
            }

            String responseBody = readResponse(conn, status);
            Map<String, Object> parsed = objectMapper.readValue(responseBody,
                    new TypeReference<Map<String, Object>>() {});
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> data = (List<Map<String, Object>>) parsed.get("data");
            if (data == null || data.isEmpty()) return null;

            @SuppressWarnings("unchecked")
            List<Double> embedding = (List<Double>) data.get(0).get("embedding");
            if (embedding == null || embedding.isEmpty()) return null;

            float[] vec = new float[embedding.size()];
            for (int i = 0; i < embedding.size(); i++) {
                vec[i] = embedding.get(i).floatValue();
            }
            return vec;
        } catch (Exception e) {
            log.warn("[Embedding] Failed: {}", e.getMessage());
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * 使用系统默认 API 配置计算 embedding（对 FileToolSeeder 等启动流程）。
     */
    public float[] embedWithDefault(String text) {
        if (defaultApiBase.isEmpty() || defaultApiKey.isEmpty()) {
            log.debug("[Embedding] Default API config not set, skip embedding for: {}",
                    text != null ? truncate(text, 50) : "null");
            return null;
        }
        return embed(text, defaultApiBase, defaultApiKey, embeddingModel);
    }

    /**
     * 将 embedding 序列化为 JSON 字符串存入 DB。
     */
    public String embeddingToJson(float[] vec) {
        if (vec == null) return null;
        try {
            return objectMapper.writeValueAsString(vec);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 从 DB 的 JSON 字符串反序列化为 float[]。
     */
    public float[] embeddingFromJson(String json) {
        if (json == null || json.isEmpty()) return null;
        try {
            List<Double> list = objectMapper.readValue(json, new TypeReference<List<Double>>() {});
            float[] vec = new float[list.size()];
            for (int i = 0; i < list.size(); i++) {
                vec[i] = list.get(i).floatValue();
            }
            return vec;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 计算两个向量的余弦相似度。
     */
    public double cosineSimilarity(float[] a, float[] b) {
        if (a == null || b == null || a.length == 0 || b.length == 0 || a.length != b.length) {
            return 0.0;
        }
        double dot = 0.0, normA = 0.0, normB = 0.0;
        for (int i = 0; i < a.length; i++) {
            dot += (double) a[i] * b[i];
            normA += (double) a[i] * a[i];
            normB += (double) b[i] * b[i];
        }
        if (normA == 0.0 || normB == 0.0) return 0.0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    private String readResponse(HttpURLConnection conn, int status) throws Exception {
        java.io.InputStream is = (status / 100 == 2) ? conn.getInputStream() : conn.getErrorStream();
        if (is == null) return "";
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) != -1) {
            bos.write(buf, 0, n);
        }
        is.close();
        return new String(bos.toByteArray(), StandardCharsets.UTF_8);
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "null";
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "...";
    }
}
