# Proposal: 文件管理页面上传按钮下移 + 分页

## Motivation
上传按钮位于页面顶部，用户上传后需滚动回顶部；文件超过 10 个时列表无分页，体验不佳。

## Summary
将上传按钮从顶部移至底部居中，为超过 10 条数据的文件列表启用 t-table 内置分页。

## What Changes
- `frontend/src/views/FileManagerView.vue` — 上传按钮位置 + 分页属性

## BREAKING
无
