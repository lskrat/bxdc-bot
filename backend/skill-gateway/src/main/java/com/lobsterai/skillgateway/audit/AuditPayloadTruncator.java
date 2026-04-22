package com.lobsterai.skillgateway.audit;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

public final class AuditPayloadTruncator {

    public record Result(byte[] stored, boolean truncated, String sha256Hex) {
    }

    private AuditPayloadTruncator() {
    }

    public static Result truncate(byte[] full, int maxBytes) {
        if (full == null) {
            return new Result(null, false, null);
        }
        String sha = sha256Hex(full);
        if (full.length <= maxBytes) {
            return new Result(full, false, sha);
        }
        byte[] prefix = new byte[maxBytes];
        System.arraycopy(full, 0, prefix, 0, maxBytes);
        return new Result(prefix, true, sha);
    }

    public static Result truncateUtf8(String full, int maxBytes) {
        if (full == null) {
            return new Result(null, false, null);
        }
        return truncate(full.getBytes(StandardCharsets.UTF_8), maxBytes);
    }

    public static String sha256Hex(byte[] data) {
        if (data == null) {
            return null;
        }
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(data));
        } catch (Exception e) {
            return null;
        }
    }
}
