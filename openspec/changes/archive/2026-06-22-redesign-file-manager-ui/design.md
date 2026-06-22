# Design: 文件管理页面 UI 改版

## Component Mapping
| 区域 | 原设计（终端风格） | 新设计（标准 UI） |
|------|---------------------|---------------------|
| 文件列表 | 等宽字体纯文本行 | t-table |
| 上传 | 命令行样式 | t-button + hidden input |
| 下载 | 文件名点击 | t-button DownloadIcon |
| 删除 | DeleteIcon 按钮 | t-popconfirm + t-button |
| 错误 | 红色文本 | t-alert |
| 加载 | blinking cursor | t-loading |
| 空状态 | `(empty directory)` | t-empty + 引导按钮 |

## File Icon Strategy
根据文件扩展名返回对应 TDesign 图标组件：FileWordIcon / FileExcelIcon / FilePptIcon / FilePdfIcon / FileImageIcon / FileIcon。
