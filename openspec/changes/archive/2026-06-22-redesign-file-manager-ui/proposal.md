# Proposal: 文件管理页面 UI 改版

## Motivation
当前 FileManagerView.vue 采用终端 `ls -l` 风格（深色背景、等宽字体），与项目其他使用 TDesign 组件的页面视觉割裂。

## Summary
将文件管理页面从终端命令行风格改版为 TDesign 组件标准 UI（t-table + t-button + t-popconfirm），与项目整体 UI 保持一致。

## What Changes
- `frontend/src/views/FileManagerView.vue` — 完全重写模板/样式为 TDesign 组件

## BREAKING
无（仅视觉改版，API 和路由不变）
