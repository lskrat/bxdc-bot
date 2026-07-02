package com.lobsterai.skillgateway.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * AES 对称加密工具（用于 auth_config.valueStatic 等敏感字段存储）。
 *
 * 设计：固定 key 从系统属性 / 环境变量读；缺失时回退到一个 dev 默认值（仅本地开发用）。
 *
 * 注意：本类由 project CLAUDE.md / AGENTS.md 约定作为「加密工具」，本次 external-service-skill 直接复用。
 * 密钥轮换策略由运维 SOP 单独管理（本次 change 不涉及）。
 */
public final class AesCipher {

    private static final Logger log = LoggerFactory.getLogger(AesCipher.class);

    private static final String ALGO = "AES/CBC/PKCS5Padding";
    /** 密钥长度必须 16/24/32 字节（AES-128/192/256）。dev 默认 16 字节字符串。 */
    private static final String DEFAULT_KEY = "bxdc-default-key";

    private AesCipher() {}

    /**
     * 取密钥（生产环境强烈建议通过环境变量覆盖）。
     */
    private static byte[] keyBytes() {
        String key = System.getProperty("bxdc.aes.key");
        if (key == null || key.isEmpty()) {
            key = System.getenv("BXDC_AES_KEY");
        }
        if (key == null || key.isEmpty()) {
            log.warn("[AesCipher] Using DEFAULT key (set -Dbxdc.aes.key or BXDC_AES_KEY env for production)");
            key = DEFAULT_KEY;
        }
        byte[] raw = key.getBytes(StandardCharsets.UTF_8);
        // 截断或补齐到 16 字节（AES-128）
        byte[] key16 = new byte[16];
        System.arraycopy(raw, 0, key16, 0, Math.min(raw.length, 16));
        return key16;
    }

    /**
     * 加密（返回 Base64 字符串）。
     */
    public static String encrypt(String plain) {
        if (plain == null) return null;
        try {
            byte[] key = keyBytes();
            byte[] iv = new byte[16];
            // IV 简化：用密钥前 16 字节（生产应随机 IV + 拼接）
            System.arraycopy(key, 0, iv, 0, 16);
            Cipher cipher = Cipher.getInstance(ALGO);
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(iv));
            byte[] enc = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(enc);
        } catch (Exception e) {
            throw new IllegalStateException("AesCipher.encrypt failed", e);
        }
    }

    /**
     * 解密（输入 Base64 字符串 → 明文）。
     */
    public static String decrypt(String cipherText) {
        if (cipherText == null) return null;
        try {
            byte[] key = keyBytes();
            byte[] iv = new byte[16];
            System.arraycopy(key, 0, iv, 0, 16);
            Cipher cipher = Cipher.getInstance(ALGO);
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(iv));
            byte[] raw = Base64.getDecoder().decode(cipherText);
            byte[] plain = cipher.doFinal(raw);
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("AesCipher.decrypt failed", e);
        }
    }

    /** CLI 测试入口。 */
    public static void main(String[] args) {
        if (args.length < 1) {
            System.out.println("Usage: java AesCipher encrypt|decrypt <text>");
            return;
        }
        String op = args[0];
        String text = args.length > 1 ? args[1] : "";
        if ("encrypt".equalsIgnoreCase(op)) {
            System.out.println(encrypt(text));
        } else if ("decrypt".equalsIgnoreCase(op)) {
            System.out.println(decrypt(text));
        } else {
            System.out.println("Unknown op: " + op);
        }
    }
}