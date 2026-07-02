/**
 * 通用复制到剪贴板工具，使用 textarea + execCommand('copy') 实现，
 * 兼容内网/老浏览器（不依赖 navigator.clipboard API）。
 *
 * @returns Promise<boolean> true=复制成功，false=失败
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.top = '-9999px'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(ta)
  }
}
