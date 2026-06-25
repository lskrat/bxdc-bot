/**
 * 下载链接守卫。
 * <p>
 * 背景：下载 URL 形如 `<base>/api/files/download/{id}?token=<HMAC>`，token 是
 * 后端用 secret 对 `fileId:userId` 做 HMAC-SHA256 签名得到的。模型不知道 secret，
 * 无法为「自己编造的 fileId」配出有效 token，因此编造的链接点击必然 401/404。
 * </p>
 * <p>
 * 本守卫在 agent-core 输出层拦截：收集本会话工具真实返回过的下载 URL 作为白名单，
 * 最终回答里凡是不在白名单的下载链接一律替换为无害提示，避免前端展示「点不开的链接」。
 * </p>
 */

/** 匹配下载链接（带或不带 query），用于提取与替换。 */
const DOWNLOAD_URL_REGEX = /https?:\/\/[^\s)\]"'<>]*\/api\/files\/download\/\d+(?:\?[^\s)\]"'<>]*)?/gi;

/**
 * 从工具结果文本里提取所有下载 URL，收进白名单 set。
 *
 * @param resultText 工具返回的原始文本（通常是 JSON 字符串）
 * @param allowed    白名单集合（原地写入）
 */
export function collectDownloadUrls(resultText: string | undefined, allowed: Set<string>): void {
  if (!resultText) {
    return;
  }
  const matches = resultText.match(DOWNLOAD_URL_REGEX);
  if (!matches) {
    return;
  }
  for (const url of matches) {
    allowed.add(url);
  }
}

/**
 * 清洗回答文本：把不在白名单的下载链接替换为提示文案。
 * <p>
 * 同时处理 Markdown 链接形式 `[文案](url)` 与裸 URL：
 * </p>
 * <ul>
 *   <li>裸 URL 不在白名单 → 替换为提示文案</li>
 *   <li>Markdown 链接 url 不在白名单 → 保留文案，去掉链接（避免点击坏链接）</li>
 * </ul>
 *
 * @param text    回答全文
 * @param allowed 白名单集合
 * @returns 清洗后的文本与是否发生改动
 */
export function sanitizeDownloadUrls(text: string, allowed: Set<string>): { text: string; changed: boolean } {
  if (!text) {
    return { text, changed: false };
  }

  let changed = false;
  const placeholder = '（该文件下载链接无效或未生成，请重新生成文件或确认文件是否存在）';

  // 1. 先处理 Markdown 链接形式：[文案](url)
  const mdLinkRegex = /\[([^\]]*)\]\((https?:\/\/[^\s)]*\/api\/files\/download\/\d+(?:\?[^\s)]*)?)\)/gi;
  let result = text.replace(mdLinkRegex, (match, label: string, url: string) => {
    if (allowed.has(url)) {
      return match;
    }
    changed = true;
    const safeLabel = label && label.trim().length > 0 ? label : '文件';
    return `${safeLabel}${placeholder}`;
  });

  // 2. 再处理剩余的裸 URL（不在白名单的）
  result = result.replace(DOWNLOAD_URL_REGEX, (url: string) => {
    if (allowed.has(url)) {
      return url;
    }
    changed = true;
    return placeholder;
  });

  return { text: result, changed };
}
