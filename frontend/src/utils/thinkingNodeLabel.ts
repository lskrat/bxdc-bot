import type { ThinkingNode, ThinkingNodeType } from '../composables/useThinkingMode'

/**
 * ThinkingMode 步骤标签：根据 type + status 动态返回中文标签。
 *
 * open spec: processing-label-by-status — 解决 type='processing' 节点在 completed 时
 * 仍显示"处理中"的 UX 问题。
 *
 * 独立成 .ts 文件而非放在 ThinkingMode.vue 内：因为 Vite 7.3.1 的 oxc extractor
 * 在解析 ThinkingMode.vue 模板/脚本中的某些中文 unicode 组合时会 panic，
 * 把这些字符串搬出 vue 文件即可绕开 oxc 触发点。
 */

const LABELS_BY_TYPE: Record<ThinkingNodeType, { active: string; done: string }> = {
  thinking: { active: '准备调用...', done: '调用准备' },
  tool_call: { active: '调用工具中...', done: '工具调用完成' },
  tool_result: { active: '工具返回中...', done: '工具返回完成' },
  llm_call: { active: '模型推理中...', done: '模型推理完成' },
  processing: { active: '生成回复中...', done: '回复已生成' },
}

const FALLBACK = { active: '处理中...', done: '已完成' }

export function getThinkingNodeLabel(node: ThinkingNode): string {
  // tool_call 节点的 title 是 "调用工具: <name>" —— 带上下文信息，必须保留显示
  if (node.type === 'tool_call' && node.title) return node.title
  // 其他 type 的 title 只是状态名（"模型推理" / "生成回复" 等），
  // 按 status 动态返回 "已完成/进行中" 文案，避免节点完成后还显示进行中状态文字
  const map = LABELS_BY_TYPE[node.type] ?? FALLBACK
  return node.status === 'completed' ? map.done : map.active
}