package com.lobsterai.skillgateway.config;

import com.lobsterai.skillgateway.audit.GatewayHttpClientAuditInterceptor;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;

@Configuration
public class SkillGatewayHttpClientConfig {

    @Bean
    public RestTemplate gatewayRestTemplate(GatewayHttpClientAuditInterceptor auditInterceptor) {
        var connectionManager = new PoolingHttpClientConnectionManager();
        connectionManager.setMaxTotal(50);
        connectionManager.setDefaultMaxPerRoute(20);
        var httpClient = HttpClients.custom()
                .setConnectionManager(connectionManager)
                .build();
        ClientHttpRequestFactory factory = new HttpComponentsClientHttpRequestFactory(httpClient);
        BufferingClientHttpRequestFactory buffering = new BufferingClientHttpRequestFactory(factory);
        RestTemplate restTemplate = new RestTemplate(buffering);
        restTemplate.setInterceptors(Collections.singletonList(auditInterceptor));
        return restTemplate;
    }
}
