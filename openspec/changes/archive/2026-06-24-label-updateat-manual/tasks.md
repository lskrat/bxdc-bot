## 1. 修改 LabelService

- [ ] 1.1 修改 `createLabel` 方法，添加 `label.setUpdateAt(LocalDateTime.now())` 手动设置时间
- [ ] 1.2 修改 `updateLabel` 方法，添加 `existing.setUpdateAt(LocalDateTime.now())` 更新时间

## 2. 测试验证

- [ ] 2.1 启动服务测试新增标签，验证 updateAt 字段是否正确设置
- [ ] 2.2 测试更新标签，验证 updateAt 字段是否正确更新
- [ ] 2.3 测试 updateBy 字段是否从请求头正确获取

