## 1. 修改 SysLabel 实体类

- [ ] 1.1 修改 `updateAt` 字段的 `@JsonFormat` 注解，将 pattern 从 `yyyy-MM-dd'T'HH:mm:ss` 改为 `yyyy-MM-dd HH:mm:ss`

## 2. 测试验证

- [ ] 2.1 启动服务测试新增标签，验证 updateAt 格式是否为 `yyyy-MM-dd HH:mm:ss`
- [ ] 2.2 测试更新标签，验证 updateAt 格式是否正确
- [ ] 2.3 测试查询标签列表，验证所有标签的 updateAt 格式是否正确

