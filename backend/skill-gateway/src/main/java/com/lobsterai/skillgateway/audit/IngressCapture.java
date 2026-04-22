package com.lobsterai.skillgateway.audit;

public record IngressCapture(
        boolean incomplete,
        String headersJson,
        byte[] body,
        boolean bodyTruncated,
        String bodySha256
) {
    public static IngressCapture missing() {
        return new IngressCapture(true, null, null, false, null);
    }
}
