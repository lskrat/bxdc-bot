package com.lobsterai.skillgateway.service;

import java.util.List;

/**
 * open spec: conversation-file-isolation / file-isolation-v2
 * <p>
 * 通过 ThreadLocal 在执行上下文传递当前会话的 enabled_files 列表和 conversationId，
 * FileManageService 的 file_list/file_delete/file_detail/file_clear_all
 * 在执行时从 Context 读取并按 enabled_files + conversationId 过滤。
 * </p>
 */
public final class FileToolConversationContext {

    private static final ThreadLocal<List<Long>> ENABLED_FILES = new ThreadLocal<List<Long>>();

    /** file-isolation-v2: 当前会话 ID，用于临时文件按 conversationId 隔离 */
    private static final ThreadLocal<String> CONVERSATION_ID = new ThreadLocal<String>();

    private FileToolConversationContext() {}

    public static void set(List<Long> ids) {
        ENABLED_FILES.set(ids);
    }

    /**
     * file-isolation-v2: 同时设置 enabled_files 和 conversationId。
     */
    public static void set(List<Long> ids, String conversationId) {
        ENABLED_FILES.set(ids);
        CONVERSATION_ID.set(conversationId);
    }

    public static List<Long> get() {
        return ENABLED_FILES.get();
    }

    public static String getConversationId() {
        return CONVERSATION_ID.get();
    }

    public static void clear() {
        ENABLED_FILES.remove();
        CONVERSATION_ID.remove();
    }
}
