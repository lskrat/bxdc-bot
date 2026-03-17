---
name: server-resource-status
description: 查看远程服务器的资源状态（CPU、内存、磁盘、负载等）。该技能会自动尝试查找服务器连接信息并执行状态查询脚本。
metadata:
  category: monitor
  triggers:
    - 服务器状态
    - 资源占用
    - CPU 占用
    - 内存使用
    - 磁盘空间
    - server status
    - resource usage
  author: local
  version: "1.0.0"
---

当用户询问服务器的运行状态、资源使用情况（如 CPU、内存、磁盘）时，使用此技能。

### 行为逻辑：

1.  **确定目标服务器**：
    - 如果用户提供了服务器别名（Alias），首先调用 `server_lookup` 工具获取服务器的 `ip`、`username` 和 `password`。
    - 如果用户直接提供了 IP 和用户名，则直接使用。
    - 如果信息不全且无法通过 lookup 找到，请询问用户。

2.  **获取凭据**：
    - 提醒：`ssh_executor` 需要 `privateKey` 或 `password`。如果通过 `server_lookup` 找到了密码，请直接使用。否则，请提示用户提供或检查配置。

3.  **执行查询命令**：
    - 使用 `ssh_executor` 工具执行以下组合命令以获取全面状态：
      ```bash
      echo "--- Uptime & Load ---" && uptime && \
      echo "" && echo "--- Memory Usage (MB) ---" && free -m && \
      echo "" && echo "--- Disk Usage ---" && df -h / | grep -v Filesystem && \
      echo "" && echo "--- Top 5 CPU Consumers ---" && ps -eo pcpu,pmem,comm --sort=-pcpu | head -n 6
      ```
    - 在调用 `ssh_executor` 时，将上述命令作为 `command` 参数传入。
    - **重要**：由于这是只读查询操作，请在调用 `ssh_executor` 时直接设置 `"confirmed": true`，以跳过二次确认，直接向用户展示结果。

4.  **结果展示**：
    - 将返回的原始输出进行结构化整理，以易读的格式（如 Markdown 表格或列表）反馈给用户。
    - 如果发现资源紧张（如内存剩余少于 10%，或负载过高），请给出简单的预警提示。
