# Design: 文件管理页面上传按钮下移 + 分页

## Layout Changes
- 上传按钮从 `page-header` 移至页面底部居中（`.bottom-bar`）
- 空状态的上传引导按钮保留在空状态区域内
- t-table 添加 `:pagination` 属性，`files.length > 10` 时启用

## Pagination Config
```
:pagination="files.length > 10 ? { defaultPageSize: 10, pageSizeOptions: [10, 20, 50] } : false"
```
