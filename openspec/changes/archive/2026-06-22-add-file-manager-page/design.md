# Design: 文件管理页面

## Architecture
前端独立新增页面，后端复用现有 `FileUploadController` 端点：
- `GET /api/files` — 列表
- `GET /api/files/download/{id}` — 下载
- `DELETE /api/files/{id}` — 删除
- `POST /api/files/upload` — 上传

## UI Design
初始版本采用终端 `ls -l` 风格（深色背景、等宽字体），后续通过 `redesign-file-manager-ui` 改版为 TDesign 标准 UI。

## File Layout
```
frontend/src/
  components/Layout.vue      — +1 菜单项
  router/index.ts             — +1 路由
  views/FileManagerView.vue   — 新建
  services/fileService.ts     — 新建
  types/fileUpload.ts         — +UserFileRecord 接口
```
