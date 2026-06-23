# Proposal: 文件管理页面

## Motivation
缺少集中的文件管理中心，用户无法直观查看、管理已上传的全部文件。

## Summary
在导航栏新增「文件管理」入口，提供独立的文件管理页面（`/file-manager`），支持浏览、下载、删除和上传文件。复用现有后端 `FileUploadController` 端点，后端零改动。

## What Changes
- `frontend/src/components/Layout.vue` — 新增导航菜单项
- `frontend/src/router/index.ts` — 新增 `/file-manager` 路由
- `frontend/src/views/FileManagerView.vue` — 新建页面
- `frontend/src/services/fileService.ts` — 新建 API 服务层

## BREAKING
无
