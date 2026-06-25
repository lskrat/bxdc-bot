/**
 * 通用复制到剪贴板工具，三层兜底兼容内网/老浏览器：
 *   1. navigator.clipboard.writeText — 现代浏览器首选（需 https/localhost + user gesture）
 *   2. 隐藏 textarea + execCommand('copy') — 内网/老浏览器兜底（MessageList.vue 的实现方式）
 *   3. 返回 false，让调用方弹"复制失败"提示用户手动选中文本
 *
 * 根因（生产环境踩坑）：
 *   - PublishApiModal / ApiDetailView 之前只调 navigator.clipboard.writeText，
 *     内网部署时浏览器可能不支持 Clipboard API（http + iframe 嵌入场景），
 *     writeText reject 后只 toast 一个错误，用户无法复制 API Key。
 *   - MessageList.copyContent / AsyncTaskResultMessage.copySummary 已经实现了 textarea 兜底，
 *     这里抽公共函数让 PublishApiModal / ApiDetailView 复用同一实现。
 *
 * @returns Promise<boolean> true=复制成功，false=两层都失败
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  // 第 1 层：标准 Clipboard API（现代浏览器）
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 进入第 2 层兜底（不抛错）
  }

  // 第 2 层：textarea + execCommand（兼容内网/IE；与 MessageList.copyContent 实现对齐）
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    // 隐藏 textarea，避免页面闪一下
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok === true
  } catch {
    return false
  }
}