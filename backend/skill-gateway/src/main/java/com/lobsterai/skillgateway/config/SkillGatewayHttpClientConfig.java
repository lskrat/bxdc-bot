package com.lobsterai.skillgateway.config;

import com.lobsterai.skillgateway.audit.GatewayHttpClientAuditInterceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;

@Configuration
public class SkillGatewayHttpClientConfig {

    @Bean
    public RestTemplate gatewayRestTemplate(GatewayHttpClientAuditInterceptor auditInterceptor) {
        ClientHttpRequestFactory underlying = new SimpleClientHttpRequestFactory();
        BufferingClientHttpRequestFactory buffering = new BufferingClientHttpRequestFactory(underlying);
        RestTemplate restTemplate = new RestTemplate(buffering);
        restTemplate.setInterceptors(Collections.singletonList(auditInterceptor));
        return restTemplate;
    }
}
